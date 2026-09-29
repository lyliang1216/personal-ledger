import { Transform, Type } from 'class-transformer'
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator'

import { TransactionType } from '../../generated/prisma/enums'

export class CreateCategoryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string

  @IsEnum(TransactionType)
  type!: TransactionType

  @IsOptional()
  @IsUUID()
  parentId?: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number
}
