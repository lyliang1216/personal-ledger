import type { BillParserInput, ParsedBill } from '../imports.types'

export interface BillParser {
  canParse(input: BillParserInput): Promise<boolean>
  parse(input: BillParserInput): Promise<ParsedBill>
}
