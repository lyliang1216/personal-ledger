import { IsEnum, IsOptional } from 'class-validator'

import { TransactionType } from '../../generated/prisma/enums'

export class QueryCategoryDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType
}
