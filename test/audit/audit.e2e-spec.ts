import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

describe('Audit Trail (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany();
    await app.close();
  });

  afterEach(async () => {
    await prisma.tenant.deleteMany();
  });

  const parse = (res: any) => JSON.parse(res.body);

  async function createTenant(name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name },
    });
    const { data } = parse(res);
    return { tenantId: data.id, apiKey: data.api_key, tenantName: data.name };
  }

  async function createFlag(tenantId: string, apiKey: string, key: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/tenants/${tenantId}/flags`,
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { key, name: key.replace(/-/g, ' '), type: 'boolean', defaultValue: false },
    });
    return parse(res).data;
  }

  // Cycle 1: tracer bullet — create flag → history has 1 'created' entry
  it('GET /flags/:key/history → 1 entry after create, action=created', async () => {
    const { tenantId, apiKey, tenantName } = await createTenant('audit-app');
    await createFlag(tenantId, apiKey, 'my-flag');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${tenantId}/flags/my-flag/history`,
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const { success, data } = parse(res);
    expect(success).toBe(true);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].action).toBe('created');
    expect(data[0].changedBy).toBe(tenantName);
    expect(data[0].oldValue).toBeNull();
    expect(data[0].newValue).toBeDefined();
  });

  // Cycle 2: update adds second entry
  it('GET /flags/:key/history → 2 entries after create+update', async () => {
    const { tenantId, apiKey } = await createTenant('audit-app');
    await createFlag(tenantId, apiKey, 'my-flag');

    await app.inject({
      method: 'PUT',
      url: `/api/v1/tenants/${tenantId}/flags/my-flag`,
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { environment: 'production', enabled: true, rolloutPercentage: 50 },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${tenantId}/flags/my-flag/history`,
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const { data } = parse(res);
    expect(data).toHaveLength(2);
    const updateEntry = data.find((e: any) => e.action === 'updated');
    expect(updateEntry).toBeDefined();
    expect(updateEntry.oldValue).toBeDefined();
    expect(updateEntry.newValue).toBeDefined();
    expect((updateEntry.newValue as any).enabled).toBe(true);
    expect((updateEntry.newValue as any).rolloutPercentage).toBe(50);
  });

  // Cycle 3: archive adds third entry, entries are chronological
  it('GET /flags/:key/history → 3 entries after create+update+archive, chronological', async () => {
    const { tenantId, apiKey } = await createTenant('audit-app');
    await createFlag(tenantId, apiKey, 'my-flag');

    await app.inject({
      method: 'PUT',
      url: `/api/v1/tenants/${tenantId}/flags/my-flag`,
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { environment: 'production', enabled: true, rolloutPercentage: 50 },
    });

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/tenants/${tenantId}/flags/my-flag`,
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${tenantId}/flags/my-flag/history`,
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const { data } = parse(res);
    expect(data).toHaveLength(3);
    expect(data[0].action).toBe('created');
    expect(data[1].action).toBe('updated');
    expect(data[2].action).toBe('archived');
    expect(data[2].newValue).toHaveProperty('archivedAt');
  });

  // Cycle 4: history for unknown flag → 404
  it('GET /flags/no-such-flag/history → 404', async () => {
    const { tenantId, apiKey } = await createTenant('audit-app');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${tenantId}/flags/no-such-flag/history`,
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(404);
    const { success, error } = parse(res);
    expect(success).toBe(false);
    expect(error.code).toBe('NOT_FOUND');
  });

  // Cycle 5: tenant isolation — other tenant cannot read history
  it('Tenant B cannot read tenant A flag history → 403', async () => {
    const tenantA = await createTenant('audit-tenant-a');
    const tenantB = await createTenant('audit-tenant-b');
    await createFlag(tenantA.tenantId, tenantA.apiKey, 'secret-flag');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${tenantA.tenantId}/flags/secret-flag/history`,
      headers: { Authorization: `Bearer ${tenantB.apiKey}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
