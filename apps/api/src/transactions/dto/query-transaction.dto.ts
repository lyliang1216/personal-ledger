import { Transform, Type } from 'class-transformer'
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'

import { TransactionSource, TransactionType } from '../../generated/prisma/enums'

export class QueryTransactionDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string

  @IsOptional()
  @IsISO8601({ strict: true })
  endDate?: string

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType

  @IsOptional()
  @IsUUID()
  ledgerId?: string

  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  @IsUUID()
  accountId?: string

  @IsOptional()
  @IsEnum(TransactionSource)
  source?: TransactionSource

  @IsOptional()
  @IsUUID()
  tagId?: string

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
