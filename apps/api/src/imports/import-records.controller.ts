import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'

import type { AuthenticatedUser } from '../auth/auth.types'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  BatchImportAccountDto,
  BatchImportCategoryDto,
  BatchImportLedgerDto,
  BatchImportTagsDto,
  ImportRecordIdsDto,
  UpdateImportDecisionDto,
  UpdateImportRecordDto,
} from './dto/import-record.dto'
import { ImportRecordsService } from './import-records.service'

@Controller('import-records')
@UseGuards(JwtAuthGuard)
export class ImportRecordsController {
  constructor(private readonly importRecordsService: ImportRecordsService) {}

  @Post('batch-ignore')
  batchIgnore(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: ImportRecordIdsDto) {
    return this.importRecordsService.batchIgnore(currentUser.userId, dto)
  }

  @Post('batch-restore')
  batchRestore(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: ImportRecordIdsDto) {
    return this.importRecordsService.batchRestore(currentUser.userId, dto)
  }

  @Post('batch-category')
  batchCategory(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: BatchImportCategoryDto,
  ) {
    return this.importRecordsService.batchCategory(currentUser.userId, dto)
  }

  @Post('batch-tags')
  batchTags(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: BatchImportTagsDto) {
    return this.importRecordsService.batchTags(currentUser.userId, dto)
  }

  @Post('batch-ledger')
  batchLedger(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: BatchImportLedgerDto) {
    return this.importRecordsService.batchLedger(currentUser.userId, dto)
  }

  @Post('batch-account')
  batchAccount(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: BatchImportAccountDto) {
    return this.importRecordsService.batchAccount(currentUser.userId, dto)
  }

  @Get(':id/candidates')
  findCandidates(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importRecordsService.findCandidates(currentUser.userId, id)
  }

  @Get(':id')
  findOne(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.importRecordsService.findOne(currentUser.userId, id)
  }

  @Patch(':id')
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImportRecordDto,
  ) {
    return this.importRecordsService.update(currentUser.userId, id, dto)
  }

  @Patch(':id/decision')
  updateDecision(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImportDecisionDto,
  ) {
    return this.importRecordsService.updateDecision(currentUser.userId, id, dto)
  }

  @Post(':id/ignore')
  ignore(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.importRecordsService.ignore(currentUser.userId, id)
  }

  @Post(':id/restore')
  restore(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.importRecordsService.restore(currentUser.userId, id)
  }
}
