import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateLedgerDto } from './dto/create-ledger.dto'
import type { UpdateLedgerDto } from './dto/update-ledger.dto'

const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 60_000,
  timeout: 60_000,
} as const

@Injectable()
export class LedgersService {
  constructor(private readonly prismaService: PrismaService) {}

  findAll(userId: string) {
    return this.prismaService.ledger.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    })
  }

  async create(userId: string, dto: CreateLedgerDto) {
    try {
      return await this.prismaService.$transaction(async (transaction) => {
        const [sameNameLedger, defaultCount] = await Promise.all([
          transaction.ledger.findFirst({
            where: { userId, name: dto.name },
            select: { id: true },
          }),
          transaction.ledger.count({
            where: { userId, isDefault: true },
          }),
        ])

        if (sameNameLedger) {
          throw new ConflictException('同名账本已存在')
        }

        if (defaultCount > 1) {
          throw new ConflictException('默认账本状态异常，请先修复数据')
        }

        return transaction.ledger.create({
          data: {
            userId,
            name: dto.name,
            description: dto.description || null,
            isDefault: defaultCount === 0,
          },
        })
      }, TRANSACTION_OPTIONS)
    } catch (error) {
      this.handleWriteError(error)
    }
  }

  async update(userId: string, id: string, dto: UpdateLedgerDto) {
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException('至少提供一个可修改字段')
    }

    await this.getOwnedLedger(userId, id)

    if (dto.name !== undefined) {
      const sameNameLedger = await this.prismaService.ledger.findFirst({
        where: {
          userId,
          name: dto.name,
          NOT: { id },
        },
        select: { id: true },
      })

      if (sameNameLedger) {
        throw new ConflictException('同名账本已存在')
      }
    }

    try {
      return await this.prismaService.ledger.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description || null } : {}),
        },
      })
    } catch (error) {
      this.handleWriteError(error)
    }
  }

  async setDefault(userId: string, id: string) {
    try {
      return await this.prismaService.$transaction(async (transaction) => {
        const target = await transaction.ledger.findFirst({
          where: { id, userId },
          select: { id: true },
        })

        if (!target) {
          throw new NotFoundException('账本不存在')
        }

        await transaction.ledger.updateMany({
          where: { userId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        })

        return transaction.ledger.update({
          where: { id },
          data: { isDefault: true },
        })
      }, TRANSACTION_OPTIONS)
    } catch (error) {
      this.handleWriteError(error)
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    const ledger = await this.prismaService.ledger.findFirst({
      where: { id, userId },
      select: {
        id: true,
        isDefault: true,
        _count: {
          select: {
            transactions: true,
            importRecords: true,
          },
        },
      },
    })

    if (!ledger) {
      throw new NotFoundException('账本不存在')
    }

    if (ledger.isDefault) {
      throw new ConflictException('默认账本不能删除')
    }

    if (ledger._count.transactions > 0 || ledger._count.importRecords > 0) {
      throw new ConflictException('账本已被业务数据使用，不能删除')
    }

    try {
      await this.prismaService.ledger.delete({ where: { id } })
    } catch (error) {
      this.handleWriteError(error)
    }
  }

  private readonly getOwnedLedger = async (userId: string, id: string) => {
    const ledger = await this.prismaService.ledger.findFirst({
      where: { id, userId },
    })

    if (!ledger) {
      throw new NotFoundException('账本不存在')
    }

    return ledger
  }

  private readonly handleWriteError = (error: unknown): never => {
    if (error instanceof ConflictException || error instanceof NotFoundException) {
      throw error
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('同名账本已存在')
      }

      if (error.code === 'P2003') {
        throw new ConflictException('账本已被业务数据使用，不能删除')
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('账本不存在')
      }

      if (error.code === 'P2034') {
        throw new ConflictException('默认账本正在被修改，请重试')
      }
    }

    throw error
  }
}
