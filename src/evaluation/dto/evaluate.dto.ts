import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvaluateDto {
  @ApiProperty({ enum: ['development', 'staging', 'production'], example: 'production' })
  @IsString()
  @IsIn(['development', 'staging', 'production'])
  environment: string;

  @ApiProperty({ example: 'dark-mode' })
  @IsString()
  flagKey: string;

  @ApiProperty({ example: 'user-123' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({ example: { plan: 'premium', country: 'US' }, description: 'Arbitrary attributes for context rule matching' })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
