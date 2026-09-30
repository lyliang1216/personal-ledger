import { Transform, Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

import {
  ImportRecordStatus,
  ImportReconcileStatus,
  ImportTaskStatus,
  TransactionSource,
} from '../../generated/prisma/enums'

export class QueryImportTaskDto {
  @IsOptional()
  @IsEnum(ImportTaskStatus)
  status?: ImportTaskStatus

  @IsOptional()
  @IsEnum(TransactionSource)
  source?: TransactionSource

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20
}

export class QueryImportRecordDto {
  @IsOptional()
  @IsEnum(ImportRecordStatus)
  status?: ImportRecordStatus

  @IsOptional()
  @IsEnum(ImportReconcileStatus)
  reconcileStatus?: ImportReconcileStatus

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value
    const keyword = value.trim()
    return keyword || undefined
  })
  @IsOptional()
  @IsString()
  keyword?: string

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20
}
