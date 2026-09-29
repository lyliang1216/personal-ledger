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
import {
  BatchCategoryTransactionDto,
  BatchDeleteTransactionDto,
  BatchLedgerTransactionDto,
  BatchTagTransactionDto,
} from './dto/batch-transaction.dto'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { QueryTransactionDto } from './dto/query-transaction.dto'
import { UpdateTransactionDto } from './dto/update-transaction.dto'
import { TransactionsService } from './transactions.service'

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  findAll(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: QueryTransactionDto) {
    return this.transactionsService.findAll(currentUser.userId, query)
  }

  @Post()
  create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateTransactionDto) {
    return this.transactionsService.create(currentUser.userId, dto)
  }

  @Post('batch-delete')
  batchDelete(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: BatchDeleteTransactionDto,
  ) {
    return this.transactionsService.batchDelete(currentUser.userId, dto)
  }

  @Post('batch-category')
  batchUpdateCategory(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: BatchCategoryTransactionDto,
  ) {
    return this.transactionsService.batchUpdateCategory(currentUser.userId, dto)
  }

  @Post('batch-tags')
  batchUpdateTags(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: BatchTagTransactionDto,
  ) {
    return this.transactionsService.batchUpdateTags(currentUser.userId, dto)
  }

  @Post('batch-ledger')
  batchUpdateLedger(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: BatchLedgerTransactionDto,
  ) {
    return this.transactionsService.batchUpdateLedger(currentUser.userId, dto)
  }

  @Get(':id')
  findOne(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactionsService.findOne(currentUser.userId, id)
  }

  @Patch(':id')
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(currentUser.userId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.transactionsService.remove(currentUser.userId, id)
  }
}
