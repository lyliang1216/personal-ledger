import { Type } from 'class-transformer'
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator'

import { TransactionType } from '../../generated/prisma/enums'

export enum StatisticsScope {
  DEFAULT = 'DEFAULT',
  ALL = 'ALL',
}

const FULL_ISO_WITH_TIMEZONE = /T.*(?:Z|[+-]\d{2}:\d{2})$/

export class StatisticsDateRangeDto {
  @IsISO8601({ strict: true })
  @Matches(FULL_ISO_WITH_TIMEZONE)
  startDate!: string

  @IsISO8601({ strict: true })
  @Matches(FULL_ISO_WITH_TIMEZONE)
  endDate!: string
}

export class StatisticsRangeQueryDto extends StatisticsDateRangeDto {
  @IsOptional()
  @IsEnum(StatisticsScope)
  scope: StatisticsScope = StatisticsScope.DEFAULT

  @IsOptional()
  @IsUUID()
  ledgerId?: string
}

export class CategoryStatisticsQueryDto extends StatisticsRangeQueryDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type: TransactionType = TransactionType.EXPENSE

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsIn([1, 2])
  level = 1
}

export class CalendarStatisticsQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string

  @IsOptional()
  @IsEnum(StatisticsScope)
  scope: StatisticsScope = StatisticsScope.DEFAULT

  @IsOptional()
  @IsUUID()
  ledgerId?: string
}

export class TopTransactionsQueryDto extends StatisticsRangeQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10
}
