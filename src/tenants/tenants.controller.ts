import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a tenant', description: 'Creates a new tenant and provisions development, staging, and production environments. Returns a one-time API key.' })
  @ApiResponse({ status: 201, description: 'Tenant created. The api_key is shown once — store it securely.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Tenant name already taken' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }
}
