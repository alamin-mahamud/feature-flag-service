import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { computeBucket, evaluate, FlagInput } from './rule-engine';
import { EvaluateDto } from './dto/evaluate.dto';
import { EvaluateBulkDto } from './dto/evaluate-bulk.dto';

export type { EvalReason, EvalResult } from './rule-engine';

type FlagEnvRow = {
  flagId: string;
  enabled: boolean;
  defaultValue: unknown;
  rolloutPercentage: number | null;
  rules: unknown;
  environment: { name: string };
  flag: { key: string; type: string; archivedAt: Date | null };
};

type CachedFlags = FlagEnvRow[];

@Injectable()
export class EvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async evaluate(tenantId: string, dto: EvaluateDto) {
    const rows = await this.loadFlags(tenantId, dto.environment);
    const row = rows.find((r) => r.flag.key === dto.flagKey);

    if (!row) {
      throw new NotFoundException(`Flag '${dto.flagKey}' not found`);
    }

    const result = evaluate(toFlagInput(row), dto.userId, dto.context ?? {});
    return { flagKey: dto.flagKey, ...result };
  }

  async evaluateBulk(tenantId: string, dto: EvaluateBulkDto) {
    const rows = await this.loadFlags(tenantId, dto.environment);
    const out: Record<string, unknown> = {};

    for (const row of rows) {
      const { value } = evaluate(toFlagInput(row), dto.userId, dto.context ?? {});
      out[row.flag.key] = value;
    }

    return out;
  }

  /** Public for backward-compat — delegates to pure rule-engine function */
  static hash(flagKey: string, userId: string): number {
    return computeBucket(flagKey, userId);
  }

  async invalidateCache(tenantId: string): Promise<void> {
    await this.cache.delByPattern(`flags:${tenantId}:*`);
  }

  private async loadFlags(tenantId: string, environment: string): Promise<FlagEnvRow[]> {
    const cacheKey = `flags:${tenantId}:${environment}`;
    const cached = await this.cache.get<CachedFlags>(cacheKey);
    if (cached) return cached;

    const rows = await this.prisma.flagEnvironment.findMany({
      where: {
        environment: { tenantId, name: environment },
        flag: { archivedAt: null },
      },
      include: {
        environment: { select: { name: true } },
        flag: { select: { key: true, type: true, archivedAt: true } },
      },
    });

    await this.cache.set(cacheKey, rows, 60);
    return rows as FlagEnvRow[];
  }
}

function toFlagInput(row: FlagEnvRow): FlagInput {
  return {
    key: row.flag.key,
    type: row.flag.type as FlagInput['type'],
    enabled: row.enabled,
    defaultValue: row.defaultValue,
    rolloutPercentage: row.rolloutPercentage,
    rules: row.rules as FlagInput['rules'],
  };
}
