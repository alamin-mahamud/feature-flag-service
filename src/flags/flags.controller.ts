import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Controller('tenants/:tenantId/flags')
@UseGuards(ApiKeyGuard)
export class FlagsController {
  @Get()
  list(@Param('tenantId') tenantId: string) {
    return [];
  }
}
