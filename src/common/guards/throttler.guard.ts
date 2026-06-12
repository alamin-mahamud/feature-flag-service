import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.tenant?.id ?? req.ip ?? 'anonymous';
  }

  protected async getErrorMessage(
    _context: ExecutionContext,
    _detail: ThrottlerLimitDetail,
  ): Promise<string> {
    return 'Rate limit exceeded. Maximum 100 requests per minute per tenant.';
  }
}
