import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { TransactionsModule } from '../transactions/transactions.module'
import { ImportUploadExceptionFilter } from './import-upload-exception.filter'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'
import { AlipayBillParser } from './parsers/alipay-bill.parser'
import { BillParserRegistry } from './parsers/bill-parser.registry'
import { JdBillParser } from './parsers/jd-bill.parser'
import { WechatBillParser } from './parsers/wechat-bill.parser'
import { ImportReconciliationService } from './reconciliation/import-reconciliation.service'

@Module({
  imports: [AuthModule, TransactionsModule],
  controllers: [ImportsController],
  providers: [
    ImportsService,
    ImportUploadExceptionFilter,
    ImportReconciliationService,
    BillParserRegistry,
    AlipayBillParser,
    JdBillParser,
    WechatBillParser,
  ],
})
export class ImportsModule {}
