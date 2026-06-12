import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { FlagsService } from './flags.service';
import { AuditService } from '../audit/audit.service';
import { CreateFlagDto } from './dto/create-flag.dto';
import { UpdateFlagDto } from './dto/update-flag.dto';
import { ListFlagsQueryDto } from './dto/list-flags.dto';

@ApiTags('flags')
@ApiBearerAuth()
@Controller('tenants/:tenantId/flags')
@UseGuards(ApiKeyGuard)
export class FlagsController {
  constructor(
    private readonly flagsService: FlagsService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a flag' })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiResponse({ status: 201, description: 'Flag created with 3 environment configs (all disabled by default)' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key does not belong to this tenant' })
  @ApiResponse({ status: 409, description: 'Flag key already exists for this tenant' })
  create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateFlagDto,
    @Req() req: any,
  ) {
    this.assertAccess(req.tenant.id, tenantId);
    return this.flagsService.create(tenantId, dto, req.tenant.name);
  }

  @Get()
  @ApiOperation({ summary: 'List flags', description: 'Returns all flags. Add ?environment to include per-env fields (enabled, rolloutPercentage, defaultValue). Add ?status=active|archived to filter.' })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiQuery({ name: 'environment', required: false, enum: ['development', 'staging', 'production'] })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'archived'] })
  @ApiResponse({ status: 200, description: 'Array of flags' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key does not belong to this tenant' })
  list(
    @Param('tenantId') tenantId: string,
    @Query() query: ListFlagsQueryDto,
    @Req() req: any,
  ) {
    this.assertAccess(req.tenant.id, tenantId);
    return this.flagsService.list(tenantId, query);
  }

  @Get(':key/history')
  @ApiOperation({ summary: 'Get flag change history (audit trail)' })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiParam({ name: 'key', description: 'Flag key' })
  @ApiResponse({ status: 200, description: 'Chronological list of audit log entries' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key does not belong to this tenant' })
  @ApiResponse({ status: 404, description: 'Flag not found' })
  getHistory(
    @Param('tenantId') tenantId: string,
    @Param('key') key: string,
    @Req() req: any,
  ) {
    this.assertAccess(req.tenant.id, tenantId);
    return this.auditService.getHistory(tenantId, key);
  }

  @Put(':key')
  @ApiOperation({ summary: 'Configure flag for an environment', description: 'Sets enabled, rolloutPercentage, and targeting rules for a specific environment.' })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiParam({ name: 'key', description: 'Flag key' })
  @ApiResponse({ status: 200, description: 'Updated flag environment config' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key does not belong to this tenant' })
  @ApiResponse({ status: 404, description: 'Flag not found' })
  update(
    @Param('tenantId') tenantId: string,
    @Param('key') key: string,
    @Body() dto: UpdateFlagDto,
    @Req() req: any,
  ) {
    this.assertAccess(req.tenant.id, tenantId);
    return this.flagsService.update(tenantId, key, dto, req.tenant.name);
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Archive (soft-delete) a flag' })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID' })
  @ApiParam({ name: 'key', description: 'Flag key' })
  @ApiResponse({ status: 200, description: 'Flag archived (archivedAt set)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key does not belong to this tenant' })
  @ApiResponse({ status: 404, description: 'Flag not found' })
  archive(
    @Param('tenantId') tenantId: string,
    @Param('key') key: string,
    @Req() req: any,
  ) {
    this.assertAccess(req.tenant.id, tenantId);
    return this.flagsService.archive(tenantId, key, req.tenant.name);
  }

  private assertAccess(authTenantId: string, paramTenantId: string) {
    if (authTenantId !== paramTenantId) {
      throw new ForbiddenException('Access denied');
    }
  }
}
