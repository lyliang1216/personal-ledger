import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateAccountDto } from './dto/create-account.dto'
import type { QueryAccountDto } from './dto/query-account.dto'
import type { UpdateAccountDto } from './dto/update-account.dto'

@Injectable()
export class AccountsService {
  constructor(private readonly prismaService: PrismaService) {}

  findAll(userId: string, query: QueryAccountDto) {
    return this.prismaService.account.findMany({
      where: {
        userId,
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    })
  }

  async create(userId: string, dto: CreateAccountDto) {
    await this.ensureNameAvailable(userId, dto.name)

    try {
      return await this.prismaService.account.create({
        data: {
          userId,
          name: dto.name,
          type: dto.type,
          description: dto.description || null,
          isActive: true,
        },
      })
    } catch (error) {
      this.handleWriteError(error)
    }
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    if (
      dto.name === undefined &&
      dto.type === undefined &&
      dto.description === undefined &&
      dto.isActive === undefined
    ) {
      throw new BadRequestException('至少提供一个可修改字段')
    }

    await this.getOwnedAccount(userId, id)

    if (dto.name !== undefined) {
      await this.ensureNameAvailable(userId, dto.name, id)
    }

    try {
      return await this.prismaService.account.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.description !== undefined ? { description: dto.description || null } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      })
    } catch (error) {
      this.handleWriteError(error)
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    const account = await this.prismaService.account.findFirst({
      where: { id, userId },
      select: {
        id: true,
        _count: {
          select: {
            transactions: true,
            importRecords: true,
          },
        },
      },
    })

    if (!account) {
      throw new NotFoundException('账户不存在')
    }

    if (account._count.transactions > 0 || account._count.importRecords > 0) {
      throw new ConflictException('账户已有关联历史数据，请停用后保留')
    }

    try {
      await this.prismaService.account.delete({ where: { id } })
    } catch (error) {
      this.handleWriteError(error)
    }
  }

  private readonly getOwnedAccount = async (userId: string, id: string) => {
    const account = await this.prismaService.account.findFirst({ where: { id, userId } })

    if (!account) {
      throw new NotFoundException('账户不存在')
    }

    return account
  }

  private readonly ensureNameAvailable = async (
    userId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> => {
    const sameNameAccount = await this.prismaService.account.findFirst({
      where: {
        userId,
        name,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    })

    if (sameNameAccount) {
      throw new ConflictException('同名账户已存在')
    }
  }

  private readonly handleWriteError = (error: unknown): never => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('同名账户已存在')
      }

      if (error.code === 'P2003') {
        throw new ConflictException('账户已有关联历史数据，请停用后保留')
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('账户不存在')
      }
    }

    throw error
  }
}
