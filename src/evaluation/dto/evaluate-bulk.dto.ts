import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvaluateBulkDto {
  @ApiProperty({
    enum: ['development', 'staging', 'production'],
    example: 'production',
  })
  @IsString()
  @IsIn(['development', 'staging', 'production'])
  environment: string;

  @ApiProperty({ example: 'user-123' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({ example: { plan: 'premium' } })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
