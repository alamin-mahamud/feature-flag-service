import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

describe('Flags (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
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
    return { tenantId: data.id, apiKey: data.api_key };
  }

  async function createFlag(tenantId: string, apiKey: string, key: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/tenants/${tenantId}/flags`,
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: {
        key,
        name: key.replace(/-/g, ' '),
        type: 'boolean',
        defaultValue: false,
      },
    });
    return parse(res).data;
  }

  // Cycle 1: tracer bullet
  it('POST /flags → 201 with id, key, name, type', async () => {
    const { tenantId, apiKey } = await createTenant('test-app');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/tenants/${tenantId}/flags`,
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { key: 'dark-mode', name: 'Dark Mode', type: 'boolean', defaultValue: false },
    });

    expect(res.statusCode).toBe(201);
    const { success, data } = parse(res);
    expect(success).toBe(true);
    expect(data.id).toBeDefined();
    expect(data.key).toBe('dark-mode');
    expect(data.name).toBe('Dark Mode');
    expect(data.type).toBe('boolean');
  });

  // Cycle 2: environments auto-created per flag
  it('POST /flags → creates FlagEnvironment for all 3 environments', async () => {
    const { tenantId, apiKey } = await createTenant('test-app');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/tenants/${tenantId}/flags`,
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { key: 'beta-feature', name: 'Beta Feature', type: 'boolean', defaultValue: false },
    });

    const { data } = parse(res);
    expect(data.environments).toHaveLength(3);
    const envNames = data.environments.map((e: any) => e.name);
    expect(envNames).toContain('development');
    expect(envNames).toContain('staging');
    expect(envNames).toContain('production');
    expect(data.environments[0].enabled).toBe(false);
  });

  // Cycle 3: list flags
  it('GET /flags → 200 returns array with created flag', async () => {
    const { tenantId, apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'dark-mode');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${tenantId}/flags`,
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const { success, data } = parse(res);
    expect(success).toBe(true);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].key).toBe('dark-mode');
  });

  // Cycle 4: status=active filter
  it('GET /flags?status=active → excludes archived flags', async () => {
    const { tenantId, apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'flag-active');
    await createFlag(tenantId, apiKey, 'flag-to-archive');

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/tenants/${tenantId}/flags/flag-to-archive`,
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${tenantId}/flags?status=active`,
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const { data } = parse(res);
    expect(data).toHaveLength(1);
    expect(data[0].key).toBe('flag-active');
  });

  // Cycle 5: environment filter adds env-specific fields
  it('GET /flags?environment=production → includes enabled + rolloutPercentage', async () => {
    const { tenantId, apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'dark-mode');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${tenantId}/flags?environment=production`,
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const { data } = parse(res);
    expect(data).toHaveLength(1);
    expect(data[0]).toHaveProperty('enabled');
    expect(data[0]).toHaveProperty('rolloutPercentage');
    expect(data[0].enabled).toBe(false);
  });

  // Cycle 6: PUT updates environment settings
  it('PUT /flags/:key → 200 updates enabled + rolloutPercentage', async () => {
    const { tenantId, apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'dark-mode');

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/tenants/${tenantId}/flags/dark-mode`,
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { environment: 'production', enabled: true, rolloutPercentage: 25 },
    });

    expect(res.statusCode).toBe(200);
    const { success, data } = parse(res);
    expect(success).toBe(true);
    expect(data.environment).toBe('production');
    expect(data.enabled).toBe(true);
    expect(data.rolloutPercentage).toBe(25);
  });

  // Cycle 7: DELETE archives flag
  it('DELETE /flags/:key → 200 sets archivedAt', async () => {
    const { tenantId, apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'dark-mode');

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tenants/${tenantId}/flags/dark-mode`,
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const { success, data } = parse(res);
    expect(success).toBe(true);
    expect(data.key).toBe('dark-mode');
    expect(data.archivedAt).not.toBeNull();
  });

  // Cycle 8: duplicate key → 409
  it('POST duplicate key → 409 CONFLICT', async () => {
    const { tenantId, apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'dark-mode');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/tenants/${tenantId}/flags`,
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { key: 'dark-mode', name: 'Dark Mode v2', type: 'boolean', defaultValue: false },
    });

    expect(res.statusCode).toBe(409);
    const { success, error } = parse(res);
    expect(success).toBe(false);
    expect(error.code).toBe('CONFLICT');
  });

  // Cycle 9: tenant isolation
  it('Tenant B key → 403 FORBIDDEN on tenant A endpoint', async () => {
    const tenantA = await createTenant('tenant-a');
    const tenantB = await createTenant('tenant-b');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${tenantA.tenantId}/flags`,
      headers: { Authorization: `Bearer ${tenantB.apiKey}` },
    });

    expect(res.statusCode).toBe(403);
    const { success, error } = parse(res);
    expect(success).toBe(false);
    expect(error.code).toBe('FORBIDDEN');
  });

  // Bonus: PUT on non-existent flag → 404
  it('PUT /flags/no-such-flag → 404 NOT_FOUND', async () => {
    const { tenantId, apiKey } = await createTenant('test-app');

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/tenants/${tenantId}/flags/no-such-flag`,
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { environment: 'production', enabled: true },
    });

    expect(res.statusCode).toBe(404);
    const { error } = parse(res);
    expect(error.code).toBe('NOT_FOUND');
  });

  // Bonus: DELETE on non-existent flag → 404
  it('DELETE /flags/no-such-flag → 404 NOT_FOUND', async () => {
    const { tenantId, apiKey } = await createTenant('test-app');

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tenants/${tenantId}/flags/no-such-flag`,
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(res.statusCode).toBe(404);
    const { error } = parse(res);
    expect(error.code).toBe('NOT_FOUND');
  });
});
