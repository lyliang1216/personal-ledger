import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateCategoryDto } from './dto/create-category.dto'
import type { QueryCategoryDto } from './dto/query-category.dto'
import type { UpdateCategoryDto } from './dto/update-category.dto'

@Injectable()
export class CategoriesService {
  constructor(private readonly prismaService: PrismaService) {}

  findAll(userId: string, query: QueryCategoryDto) {
    return this.prismaService.category.findMany({
      where: {
        userId,
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
    })
  }

  async create(userId: string, dto: CreateCategoryDto) {
    const parentId = dto.parentId ?? null

    if (parentId) {
      const parent = await this.prismaService.category.findFirst({
        where: { id: parentId, userId },
        select: { parentId: true, type: true },
      })

      if (!parent) {
        throw new NotFoundException('父分类不存在')
      }

      if (parent.parentId) {
        throw new BadRequestException('当前仅支持两级分类')
      }

      if (parent.type !== dto.type) {
        throw new BadRequestException('子分类收支类型必须与父分类一致')
      }
    }

    await this.ensureNameAvailable(userId, parentId, dto.type, dto.name)

    return this.prismaService.category.create({
      data: {
        userId,
        parentId,
        name: dto.name,
        type: dto.type,
        icon: dto.icon || null,
        sort: dto.sort ?? 0,
      },
    })
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    if (
      dto.name === undefined &&
      dto.icon === undefined &&
      dto.sort === undefined &&
      dto.isActive === undefined
    ) {
      throw new BadRequestException('至少提供一个可修改字段')
    }

    const category = await this.getOwnedCategory(userId, id)

    if (dto.name !== undefined) {
      await this.ensureNameAvailable(userId, category.parentId, category.type, dto.name, id)
    }

    try {
      return await this.prismaService.category.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon || null } : {}),
          ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      })
    } catch (error) {
      this.handleDeleteError(error)
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    const category = await this.prismaService.category.findFirst({
      where: { id, userId },
      select: {
        id: true,
        _count: {
          select: {
            children: true,
            transactions: true,
            importRecords: true,
          },
        },
      },
    })

    if (!category) {
      throw new NotFoundException('分类不存在')
    }

    if (category._count.children > 0) {
      throw new ConflictException('分类下存在子分类，不能删除')
    }

    if (category._count.transactions > 0 || category._count.importRecords > 0) {
      throw new ConflictException('分类已被业务数据使用，不能删除')
    }

    try {
      await this.prismaService.category.delete({ where: { id } })
    } catch (error) {
      this.handleDeleteError(error)
    }
  }

  private readonly getOwnedCategory = async (userId: string, id: string) => {
    const category = await this.prismaService.category.findFirst({
      where: { id, userId },
    })

    if (!category) {
      throw new NotFoundException('分类不存在')
    }

    return category
  }

  private readonly ensureNameAvailable = async (
    userId: string,
    parentId: string | null,
    type: CreateCategoryDto['type'],
    name: string,
    excludeId?: string,
  ): Promise<void> => {
    const sameNameCategory = await this.prismaService.category.findFirst({
      where: {
        userId,
        parentId,
        type,
        name,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    })

    if (sameNameCategory) {
      throw new ConflictException('同层级、同类型下已存在同名分类')
    }
  }

  private readonly handleDeleteError = (error: unknown): never => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        throw new ConflictException('分类已被业务数据使用，不能删除')
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('分类不存在')
      }
    }

    throw error
  }
}
