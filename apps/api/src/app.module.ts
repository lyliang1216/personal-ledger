import { Module } from '@nestjs/common'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AccountsModule } from './accounts/accounts.module'
import { AuthModule } from './auth/auth.module'
import { CategoriesModule } from './categories/categories.module'
import { LedgersModule } from './ledgers/ledgers.module'
import { PrismaModule } from './prisma/prisma.module'
import { TagsModule } from './tags/tags.module'
import { TransactionsModule } from './transactions/transactions.module'

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    LedgersModule,
    CategoriesModule,
    TagsModule,
    AccountsModule,
    TransactionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
