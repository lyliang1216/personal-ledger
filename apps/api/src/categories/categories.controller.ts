import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'

import type { AuthenticatedUser } from '../auth/auth.types'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CategoriesService } from './categories.service'
import { CreateCategoryDto } from './dto/create-category.dto'
import { QueryCategoryDto } from './dto/query-category.dto'
import { UpdateCategoryDto } from './dto/update-category.dto'

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: QueryCategoryDto) {
    return this.categoriesService.findAll(currentUser.userId, query)
  }

  @Post()
  create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(currentUser.userId, dto)
  }

  @Patch(':id')
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(currentUser.userId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.categoriesService.remove(currentUser.userId, id)
  }
}
