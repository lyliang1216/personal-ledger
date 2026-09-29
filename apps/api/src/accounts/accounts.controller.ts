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
import { AccountsService } from './accounts.service'
import { CreateAccountDto } from './dto/create-account.dto'
import { QueryAccountDto } from './dto/query-account.dto'
import { UpdateAccountDto } from './dto/update-account.dto'

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  findAll(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: QueryAccountDto) {
    return this.accountsService.findAll(currentUser.userId, query)
  }

  @Post()
  create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateAccountDto) {
    return this.accountsService.create(currentUser.userId, dto)
  }

  @Patch(':id')
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(currentUser.userId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.accountsService.remove(currentUser.userId, id)
  }
}
