import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFlagDto {
  @ApiProperty({
    enum: ['development', 'staging', 'production'],
    example: 'production',
  })
  @IsString()
  @IsIn(['development', 'staging', 'production'])
  environment: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, example: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  rolloutPercentage?: number;

  @ApiPropertyOptional({
    example: {
      userOverrides: { alice: true },
      contextRules: [
        {
          field: 'plan',
          operator: 'eq',
          value: 'premium',
          rolloutPercentage: 100,
        },
      ],
    },
    description: 'User overrides and context-based targeting rules',
  })
  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;
}
