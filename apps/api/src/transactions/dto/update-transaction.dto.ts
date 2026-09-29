import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator'

import { TransactionType } from '../../generated/prisma/enums'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

const normalizeAmount = ({ value }: { value: unknown }): unknown =>
  typeof value === 'number' ? String(value) : trimString({ value })

export class UpdateTransactionDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType

  @Transform(normalizeAmount)
  @IsOptional()
  @IsString()
  @Matches(/^\d+(?:\.\d{1,4})?$/, { message: 'amount 必须是最多四位小数的正数' })
  amount?: string

  @IsOptional()
  @IsISO8601({ strict: true })
  transactionTime?: string

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  merchant?: string

  @Transform(trimString)
  @IsOptional()
  @IsString()
  description?: string

  @Transform(trimString)
  @IsOptional()
  @IsString()
  remark?: string

  @IsOptional()
  @IsUUID()
  ledgerId?: string

  @IsOptional()
  @IsUUID()
  categoryId?: string | null

  @IsOptional()
  @IsUUID()
  accountId?: string | null

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tagIds?: string[]
}
