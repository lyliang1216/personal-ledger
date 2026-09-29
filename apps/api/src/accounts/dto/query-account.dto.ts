import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional } from 'class-validator'

export class QueryAccountDto {
  @Transform(({ value }) => {
    if (value === 'true') return true
    if (value === 'false') return false
    return value
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
