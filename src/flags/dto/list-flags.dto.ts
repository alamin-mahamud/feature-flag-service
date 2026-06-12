import { IsIn, IsOptional } from 'class-validator';

export class ListFlagsQueryDto {
  @IsOptional()
  @IsIn(['development', 'staging', 'production'])
  environment?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: string;
}
