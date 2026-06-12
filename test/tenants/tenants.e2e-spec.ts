import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Tenants (e2e)', () => {
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
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

  // Cycle 1: tracer bullet
  it('POST /api/v1/tenants → 201 with id, name, api_key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: 'test-app' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.name).toBe('test-app');
    expect(body.api_key).toBeDefined();
  });

  // Cycle 2: environments auto-created
  it('POST /api/v1/tenants → auto-creates 3 environments', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: 'test-app' },
    });

    const body = JSON.parse(res.body);
    expect(body.environments).toHaveLength(3);
    const names = body.environments.map((e: any) => e.name);
    expect(names).toContain('development');
    expect(names).toContain('staging');
    expect(names).toContain('production');
  });

  // Cycle 3: api_key has ff- prefix
  it('POST /api/v1/tenants → api_key starts with ff-', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: 'test-app' },
    });

    const body = JSON.parse(res.body);
    expect(body.api_key).toMatch(/^ff-/);
  });

  // Cycle 4: api_key is stored hashed — raw key not in DB
  it('api_key is stored hashed — DB has hash not raw key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: 'test-app' },
    });

    const { id, api_key } = JSON.parse(res.body);
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    expect(tenant!.apiKeyHash).not.toBe(api_key);
    expect(tenant!.apiKeyHash).toHaveLength(64); // sha256 hex = 64 chars
  });

  // Cycle 5: valid api_key → 200 on protected endpoint
  it('valid api_key in Authorization header → 200', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: 'test-app' },
    });
    const { id, api_key } = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${id}/flags`,
      headers: { Authorization: `Bearer ${api_key}` },
    });

    expect(res.statusCode).toBe(200);
  });

  // Cycle 6: no api_key → 401
  it('no Authorization header → 401', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: 'test-app' },
    });
    const { id } = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${id}/flags`,
    });

    expect(res.statusCode).toBe(401);
  });

  // Cycle 7: invalid api_key → 401
  it('invalid api_key → 401', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: 'test-app' },
    });
    const { id } = JSON.parse(createRes.body);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${id}/flags`,
      headers: { Authorization: 'Bearer ff-invalid-key' },
    });

    expect(res.statusCode).toBe(401);
  });

  // Cycle 8: two tenants → unique keys
  it('two tenants → each gets a unique api_key', async () => {
    const [r1, r2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/tenants',
        payload: { name: 'app-one' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/tenants',
        payload: { name: 'app-two' },
      }),
    ]);

    const key1 = JSON.parse(r1.body).api_key;
    const key2 = JSON.parse(r2.body).api_key;
    expect(key1).not.toBe(key2);
  });

  // Duplicate name → 409
  it('POST /api/v1/tenants with duplicate name → 409', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: 'duplicate-app' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: 'duplicate-app' },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).message).toMatch(/already taken/);
  });
});
