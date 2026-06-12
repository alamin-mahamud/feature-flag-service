import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { AuditService } from '../audit/audit.service';
import { CreateFlagDto } from './dto/create-flag.dto';
import { UpdateFlagDto } from './dto/update-flag.dto';
import { ListFlagsQueryDto } from './dto/list-flags.dto';

@Injectable()
export class FlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateFlagDto, changedBy: string) {
    const environments = await this.prisma.environment.findMany({
      where: { tenantId },
    });

    try {
      const flag = await this.prisma.flag.create({
        data: {
          tenantId,
          key: dto.key,
          name: dto.name,
          description: dto.description,
          type: dto.type,
          flagEnvironments: {
            create: environments.map((env) => ({
              environmentId: env.id,
              enabled: false,
              ...(dto.defaultValue !== undefined && {
                defaultValue: dto.defaultValue as Prisma.InputJsonValue,
              }),
            })),
          },
        },
        include: {
          flagEnvironments: {
            include: { environment: true },
            orderBy: { environment: { name: 'asc' } },
          },
        },
      });

      await this.cache.delByPattern(`flags:${tenantId}:*`);

      const result = {
        id: flag.id,
        key: flag.key,
        name: flag.name,
        description: flag.description,
        type: flag.type,
        createdAt: flag.createdAt,
        environments: flag.flagEnvironments.map((fe) => ({
          name: fe.environment.name,
          enabled: fe.enabled,
          rolloutPercentage: fe.rolloutPercentage,
        })),
      };

      await this.audit.log({
        tenantId,
        flagId: flag.id,
        action: 'created',
        changedBy,
        newValue: result,
      });

      return result;
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          `Flag key '${dto.key}' already exists for this tenant`,
        );
      }
      throw err;
    }
  }

  async list(tenantId: string, query: ListFlagsQueryDto) {
    const where: Prisma.FlagWhereInput = { tenantId };
    if (query.status === 'active') where.archivedAt = null;
    if (query.status === 'archived') where.archivedAt = { not: null };

    const flags = await this.prisma.flag.findMany({
      where,
      include: {
        flagEnvironments: {
          include: { environment: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return flags.map((flag) => {
      const base = {
        id: flag.id,
        key: flag.key,
        name: flag.name,
        description: flag.description,
        type: flag.type,
        archivedAt: flag.archivedAt,
        createdAt: flag.createdAt,
      };

      if (query.environment) {
        const fe = flag.flagEnvironments.find(
          (e) => e.environment.name === query.environment,
        );
        return {
          ...base,
          enabled: fe?.enabled ?? false,
          rolloutPercentage: fe?.rolloutPercentage ?? null,
          defaultValue: fe?.defaultValue ?? null,
        };
      }

      return base;
    });
  }

  async update(tenantId: string, key: string, dto: UpdateFlagDto, changedBy: string) {
    const flag = await this.findOrFail(tenantId, key);

    const environment = await this.prisma.environment.findFirst({
      where: { tenantId, name: dto.environment },
    });
    if (!environment) throw new NotFoundException('Environment not found');

    const oldFe = await this.prisma.flagEnvironment.findUnique({
      where: {
        flagId_environmentId: { flagId: flag.id, environmentId: environment.id },
      },
    });

    const updateData: Prisma.FlagEnvironmentUpdateInput = {};
    if (dto.enabled !== undefined) updateData.enabled = dto.enabled;
    if (dto.rolloutPercentage !== undefined)
      updateData.rolloutPercentage = dto.rolloutPercentage;
    if (dto.rules !== undefined)
      updateData.rules = dto.rules as Prisma.InputJsonValue;

    const fe = await this.prisma.flagEnvironment.update({
      where: {
        flagId_environmentId: {
          flagId: flag.id,
          environmentId: environment.id,
        },
      },
      data: updateData,
    });

    await this.cache.delByPattern(`flags:${tenantId}:*`);

    const result = {
      id: fe.id,
      environment: dto.environment,
      enabled: fe.enabled,
      rolloutPercentage: fe.rolloutPercentage,
      rules: fe.rules,
    };

    const oldValue = oldFe
      ? { enabled: oldFe.enabled, rolloutPercentage: oldFe.rolloutPercentage, rules: oldFe.rules }
      : null;

    await this.audit.log({
      tenantId,
      flagId: flag.id,
      environmentId: environment.id,
      action: 'updated',
      changedBy,
      oldValue,
      newValue: { enabled: fe.enabled, rolloutPercentage: fe.rolloutPercentage, rules: fe.rules },
    });

    return result;
  }

  async archive(tenantId: string, key: string, changedBy: string) {
    const flag = await this.findOrFail(tenantId, key);

    const archived = await this.prisma.flag.update({
      where: { id: flag.id },
      data: { archivedAt: new Date() },
    });

    await this.cache.delByPattern(`flags:${tenantId}:*`);

    const result = {
      id: archived.id,
      key: archived.key,
      archivedAt: archived.archivedAt,
    };

    await this.audit.log({
      tenantId,
      flagId: flag.id,
      action: 'archived',
      changedBy,
      newValue: result,
    });

    return result;
  }

  private async findOrFail(tenantId: string, key: string) {
    const flag = await this.prisma.flag.findFirst({
      where: { tenantId, key },
    });
    if (!flag) throw new NotFoundException(`Flag '${key}' not found`);
    return flag;
  }
}
