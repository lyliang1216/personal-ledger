import { Transform } from 'class-transformer'
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

import { AccountType } from '../../generated/prisma/enums'

export class CreateAccountDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string

  @IsEnum(AccountType)
  type!: AccountType

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string
}
