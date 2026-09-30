import { Controller, Get, Query, UseGuards } from '@nestjs/common'

import type { AuthenticatedUser } from '../auth/auth.types'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  CalendarStatisticsQueryDto,
  CategoryStatisticsQueryDto,
  StatisticsDateRangeDto,
  StatisticsRangeQueryDto,
  TopTransactionsQueryDto,
} from './dto/query-statistics.dto'
import { StatisticsService } from './statistics.service'

@Controller('statistics')
@UseGuards(JwtAuthGuard)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('overview')
  overview(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: StatisticsRangeQueryDto) {
    return this.statisticsService.overview(currentUser.userId, query)
  }

  @Get('daily')
  daily(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: StatisticsRangeQueryDto) {
    return this.statisticsService.daily(currentUser.userId, query)
  }

  @Get('monthly')
  monthly(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: StatisticsRangeQueryDto) {
    return this.statisticsService.monthly(currentUser.userId, query)
  }

  @Get('categories')
  categories(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: CategoryStatisticsQueryDto,
  ) {
    return this.statisticsService.categories(currentUser.userId, query)
  }

  @Get('tags')
  tags(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: StatisticsRangeQueryDto) {
    return this.statisticsService.tags(currentUser.userId, query)
  }

  @Get('accounts')
  accounts(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: StatisticsRangeQueryDto) {
    return this.statisticsService.accounts(currentUser.userId, query)
  }

  @Get('ledgers')
  ledgers(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: StatisticsDateRangeDto) {
    return this.statisticsService.ledgers(currentUser.userId, query)
  }

  @Get('calendar')
  calendar(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: CalendarStatisticsQueryDto,
  ) {
    return this.statisticsService.calendar(currentUser.userId, query)
  }

  @Get('top-transactions')
  topTransactions(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: TopTransactionsQueryDto,
  ) {
    return this.statisticsService.topTransactions(currentUser.userId, query)
  }
}
