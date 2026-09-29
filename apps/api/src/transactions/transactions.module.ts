import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { TransactionReconciliationService } from './transaction-reconciliation.service'
import { TransactionsController } from './transactions.controller'
import { TransactionsService } from './transactions.service'

@Module({
  imports: [AuthModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionReconciliationService],
  exports: [TransactionReconciliationService],
})
export class TransactionsModule {}
