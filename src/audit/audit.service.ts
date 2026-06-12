import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction = 'created' | 'updated' | 'archived';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    tenantId: string;
    flagId: string;
    environmentId?: string;
    action: AuditAction;
    changedBy: string;
    oldValue?: unknown;
    newValue: unknown;
  }) {
    await this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        flagId: params.flagId,
        environmentId: params.environmentId ?? null,
        action: params.action,
        changedBy: params.changedBy,
        oldValue: params.oldValue !== undefined
          ? (params.oldValue as Prisma.InputJsonValue)
          : undefined,
        newValue: params.newValue as Prisma.InputJsonValue,
      },
    });
  }

  async getHistory(tenantId: string, flagKey: string) {
    const flag = await this.prisma.flag.findFirst({
      where: { tenantId, key: flagKey },
    });
    if (!flag) throw new NotFoundException(`Flag '${flagKey}' not found`);

    const logs = await this.prisma.auditLog.findMany({
      where: { tenantId, flagId: flag.id },
      orderBy: { createdAt: 'asc' },
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      changedBy: log.changedBy,
      environmentId: log.environmentId,
      oldValue: log.oldValue,
      newValue: log.newValue,
      createdAt: log.createdAt,
    }));
  }
}
