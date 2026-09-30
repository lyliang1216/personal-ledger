import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'

import type { AuthenticatedUser } from '../auth/auth.types'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { QueryImportRecordDto, QueryImportTaskDto } from './dto/query-import.dto'
import { ImportUploadExceptionFilter } from './import-upload-exception.filter'
import { ImportsService } from './imports.service'
import type { UploadedBillFile } from './imports.types'

export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024

@Controller('imports')
@UseGuards(JwtAuthGuard)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_SIZE } }))
  @UseFilters(ImportUploadExceptionFilter)
  upload(@CurrentUser() currentUser: AuthenticatedUser, @UploadedFile() file?: UploadedBillFile) {
    return this.importsService.upload(currentUser.userId, file)
  }

  @Get()
  findAll(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: QueryImportTaskDto) {
    return this.importsService.findAll(currentUser.userId, query)
  }

  @Get(':id/records')
  findRecords(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryImportRecordDto,
  ) {
    return this.importsService.findRecords(currentUser.userId, id, query)
  }

  @Get(':id')
  findOne(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.importsService.findOne(currentUser.userId, id)
  }
}
