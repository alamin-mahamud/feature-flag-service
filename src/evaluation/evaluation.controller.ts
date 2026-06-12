import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { TenantRequest } from '../common/types/tenant-request';
import { EvaluationService } from './evaluation.service';
import { EvaluateDto } from './dto/evaluate.dto';
import { EvaluateBulkDto } from './dto/evaluate-bulk.dto';

@ApiTags('evaluation')
@ApiBearerAuth()
@Controller('evaluate')
@UseGuards(ApiKeyGuard)
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Evaluate a single flag for a user',
    description:
      'Returns the flag value and the reason (DISABLED, USER_OVERRIDE, CONTEXT_RULE, ROLLOUT, DEFAULT).',
  })
  @ApiResponse({
    status: 200,
    description: 'Evaluation result with value and reason',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 404, description: 'Flag not found' })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded (100 req/min per tenant)',
  })
  evaluate(@Body() dto: EvaluateDto, @Req() req: TenantRequest) {
    return this.evaluationService.evaluate(req.tenant.id, dto);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Evaluate all active flags for a user',
    description:
      'Returns an object keyed by flag key with evaluated values. Archived flags are excluded.',
  })
  @ApiResponse({
    status: 200,
    description: 'Object mapping flag keys to their evaluated values',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded (100 req/min per tenant)',
  })
  evaluateBulk(@Body() dto: EvaluateBulkDto, @Req() req: TenantRequest) {
    return this.evaluationService.evaluateBulk(req.tenant.id, dto);
  }
}
