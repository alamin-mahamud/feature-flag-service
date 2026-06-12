import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TenantRequest } from '../types/tenant-request';

@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const tenant = (req as unknown as TenantRequest).tenant;
    return Promise.resolve(
      tenant?.id ?? (req['ip'] as string | undefined) ?? 'anonymous',
    );
  }

  protected getErrorMessage(): Promise<string> {
    return Promise.resolve(
      'Rate limit exceeded. Maximum 100 requests per minute per tenant.',
    );
  }
}
