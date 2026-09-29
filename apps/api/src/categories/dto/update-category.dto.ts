import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class UpdateCategoryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
