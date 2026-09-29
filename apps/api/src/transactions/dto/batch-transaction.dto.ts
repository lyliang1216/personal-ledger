import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsUUID } from 'class-validator'

enum BatchTagMode {
  ADD = 'ADD',
  REMOVE = 'REMOVE',
}

class TransactionIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[]
}

export class BatchDeleteTransactionDto extends TransactionIdsDto {}

export class BatchCategoryTransactionDto extends TransactionIdsDto {
  @IsUUID()
  categoryId!: string
}

export class BatchTagTransactionDto extends TransactionIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tagIds!: string[]

  @IsEnum(BatchTagMode)
  mode!: BatchTagMode
}

export class BatchLedgerTransactionDto extends TransactionIdsDto {
  @IsUUID()
  ledgerId!: string
}
