import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
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

import { ImportRecordDecision, TransactionType } from '../../generated/prisma/enums'

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value

const normalizeAmount = ({ value }: { value: unknown }): unknown =>
  typeof value === 'number' ? String(value) : trimString({ value })

export class UpdateImportRecordDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType

  @Transform(normalizeAmount)
  @IsOptional()
  @IsString()
  @Matches(/^\d+(?:\.\d{1,4})?$/, { message: 'amount 必须是最多四位小数的非负数' })
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
  categoryId?: string | null

  @IsOptional()
  @IsUUID()
  ledgerId?: string | null

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

export class UpdateImportDecisionDto {
  @IsEnum(ImportRecordDecision)
  decision!: ImportRecordDecision

  @IsOptional()
  @IsUUID()
  candidateTransactionId?: string

  @IsOptional()
  @IsUUID()
  candidateSourceRecordId?: string
}

export class ImportRecordIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[]
}

export class BatchImportCategoryDto extends ImportRecordIdsDto {
  @IsUUID()
  categoryId!: string
}

export enum ImportTagBatchMode {
  ADD = 'ADD',
  REMOVE = 'REMOVE',
}

export class BatchImportTagsDto extends ImportRecordIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tagIds!: string[]

  @IsEnum(ImportTagBatchMode)
  mode!: ImportTagBatchMode
}

export class BatchImportLedgerDto extends ImportRecordIdsDto {
  @IsUUID()
  ledgerId!: string
}

export class BatchImportAccountDto extends ImportRecordIdsDto {
  @IsUUID()
  accountId!: string
}
