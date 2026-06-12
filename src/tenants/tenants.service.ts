import { ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

const ENVIRONMENTS = ['development', 'staging', 'production'];

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    const rawKey = `ff-${randomBytes(32).toString('hex')}`;
    const apiKeyHash = createHash('sha256').update(rawKey).digest('hex');

    try {
      const tenant = await this.prisma.tenant.create({
        data: {
          name: dto.name,
          apiKeyHash,
          environments: {
            create: ENVIRONMENTS.map((name) => ({ name })),
          },
        },
        include: { environments: true },
      });

      return {
        id: tenant.id,
        name: tenant.name,
        api_key: rawKey,
        environments: tenant.environments.map((e) => ({
          id: e.id,
          name: e.name,
        })),
      };
    } catch (err) {
      if (
        err instanceof PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `Tenant name '${dto.name}' is already taken`,
        );
      }
      throw err;
    }
  }
}
