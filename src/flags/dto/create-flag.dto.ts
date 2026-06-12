import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFlagDto {
  @ApiProperty({
    example: 'dark-mode',
    description: 'Unique flag key (lowercase, hyphens allowed)',
  })
  @IsString()
  @MinLength(2)
  @Matches(/^[a-z0-9][a-z0-9-]*$/, {
    message: 'key must be lowercase alphanumeric with hyphens',
  })
  key: string;

  @ApiProperty({ example: 'Dark Mode' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: 'Enables dark mode UI' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['boolean', 'string', 'number'], example: 'boolean' })
  @IsString()
  @IsIn(['boolean', 'string', 'number'])
  type: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Default value returned when flag is disabled',
  })
  @IsOptional()
  defaultValue?: unknown;
}
