import { Injectable } from '@nestjs/common'

import type { BillParserInput, ParsedBill } from '../imports.types'
import { AlipayBillParser } from './alipay-bill.parser'
import type { BillParser } from './bill-parser.interface'
import { JdBillParser } from './jd-bill.parser'
import { WechatBillParser } from './wechat-bill.parser'

@Injectable()
export class BillParserRegistry {
  private readonly parsers: BillParser[]

  constructor(
    alipayBillParser: AlipayBillParser,
    jdBillParser: JdBillParser,
    wechatBillParser: WechatBillParser,
  ) {
    this.parsers = [alipayBillParser, jdBillParser, wechatBillParser]
  }

  async parse(input: BillParserInput): Promise<ParsedBill | null> {
    for (const parser of this.parsers) {
      if (await parser.canParse(input)) return parser.parse(input)
    }

    return null
  }
}
