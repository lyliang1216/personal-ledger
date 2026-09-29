import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateTagDto } from './dto/create-tag.dto'
import type { QueryTagDto } from './dto/query-tag.dto'
import type { UpdateTagDto } from './dto/update-tag.dto'

@Injectable()
export class TagsService {
  constructor(private readonly prismaService: PrismaService) {}

  findAll(userId: string, query: QueryTagDto) {
    return this.prismaService.tag.findMany({
      where: {
        userId,
        ...(query.keyword
          ? {
              name: {
                contains: query.keyword,
                mode: 'insensitive' as const,
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  async create(userId: string, dto: CreateTagDto) {
    await this.ensureNameAvailable(userId, dto.name)

    try {
      return await this.prismaService.tag.create({
        data: {
          userId,
          name: dto.name,
          description: dto.description || null,
        },
      })
    } catch (error) {
      this.handleWriteError(error)
    }
  }

  async update(userId: string, id: string, dto: UpdateTagDto) {
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException('至少提供一个可修改字段')
    }

    await this.getOwnedTag(userId, id)

    if (dto.name !== undefined) {
      await this.ensureNameAvailable(userId, dto.name, id)
    }

    try {
      return await this.prismaService.tag.update({
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

  async remove(userId: string, id: string): Promise<void> {
    const tag = await this.prismaService.tag.findFirst({
      where: { id, userId },
      select: {
        id: true,
        _count: {
          select: {
            transactionTags: true,
            importRecordTags: true,
          },
        },
      },
    })

    if (!tag) {
      throw new NotFoundException('标签不存在')
    }

    if (tag._count.transactionTags > 0 || tag._count.importRecordTags > 0) {
      throw new ConflictException('标签已被业务数据使用，不能删除')
    }

    try {
      await this.prismaService.tag.delete({ where: { id } })
    } catch (error) {
      this.handleWriteError(error)
    }
  }

  private readonly getOwnedTag = async (userId: string, id: string) => {
    const tag = await this.prismaService.tag.findFirst({ where: { id, userId } })

    if (!tag) {
      throw new NotFoundException('标签不存在')
    }

    return tag
  }

  private readonly ensureNameAvailable = async (
    userId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> => {
    const sameNameTag = await this.prismaService.tag.findFirst({
      where: {
        userId,
        name,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    })

    if (sameNameTag) {
      throw new ConflictException('同名标签已存在')
    }
  }

  private readonly handleWriteError = (error: unknown): never => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('同名标签已存在')
      }

      if (error.code === 'P2003') {
        throw new ConflictException('标签已被业务数据使用，不能删除')
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('标签不存在')
      }
    }

    throw error
  }
}
