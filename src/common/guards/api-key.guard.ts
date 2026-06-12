import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantRequest } from '../types/tenant-request';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<
        TenantRequest & { headers: Record<string, string | undefined> }
      >();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing API key');
    }

    const rawKey = authHeader.slice(7);
    const apiKeyHash = createHash('sha256').update(rawKey).digest('hex');

    const tenant = await this.prisma.tenant.findFirst({
      where: { apiKeyHash },
    });

    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.tenant = tenant;
    return true;
  }
}
