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

describe('Evaluation (e2e)', () => {
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
    return parse(res).data;
  }

  async function createFlag(
    tenantId: string,
    apiKey: string,
    key: string,
    overrides?: object,
  ) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/tenants/${tenantId}/flags`,
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: {
        key,
        name: key,
        type: 'boolean',
        defaultValue: false,
        ...overrides,
      },
    });
    return parse(res).data;
  }

  async function enableFlag(
    tenantId: string,
    apiKey: string,
    flagKey: string,
    env: string,
    extra?: object,
  ) {
    return app.inject({
      method: 'PUT',
      url: `/api/v1/tenants/${tenantId}/flags/${flagKey}`,
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { environment: env, enabled: true, ...extra },
    });
  }

  // Cycle 1: tracer bullet — evaluate disabled flag → default value
  it('evaluate disabled flag → default value with reason DISABLED', async () => {
    const { id: tenantId, api_key: apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'dark-mode');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluate',
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { environment: 'production', flagKey: 'dark-mode', userId: 'u1' },
    });

    expect(res.statusCode).toBe(200);
    const { success, data } = parse(res);
    expect(success).toBe(true);
    expect(data.flagKey).toBe('dark-mode');
    expect(data.value).toBe(false);
    expect(data.reason).toBe('DISABLED');
  });

  // Cycle 2: enabled flag with 100% rollout → true
  it('enabled flag at 100% rollout → value true for any user', async () => {
    const { id: tenantId, api_key: apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'beta');
    await enableFlag(tenantId, apiKey, 'beta', 'production', {
      rolloutPercentage: 100,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluate',
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { environment: 'production', flagKey: 'beta', userId: 'any-user' },
    });

    const { data } = parse(res);
    expect(data.value).toBe(true);
    expect(data.reason).toBe('ROLLOUT');
  });

  // Cycle 3: enabled flag at 0% rollout → false for all users
  it('enabled flag at 0% rollout → value false (default) for all users', async () => {
    const { id: tenantId, api_key: apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'off-feature');
    await enableFlag(tenantId, apiKey, 'off-feature', 'production', {
      rolloutPercentage: 0,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluate',
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: {
        environment: 'production',
        flagKey: 'off-feature',
        userId: 'user-99',
      },
    });

    const { data } = parse(res);
    expect(data.value).toBe(false);
  });

  // Cycle 4: determinism — same user always gets same bucket
  it('same user always gets same evaluation result', async () => {
    const { id: tenantId, api_key: apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'checkout');
    await enableFlag(tenantId, apiKey, 'checkout', 'production', {
      rolloutPercentage: 50,
    });

    const payload = {
      environment: 'production',
      flagKey: 'checkout',
      userId: 'deterministic-user',
    };

    const [r1, r2, r3] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/evaluate', headers: { Authorization: `Bearer ${apiKey}` }, payload }),
      app.inject({ method: 'POST', url: '/api/v1/evaluate', headers: { Authorization: `Bearer ${apiKey}` }, payload }),
      app.inject({ method: 'POST', url: '/api/v1/evaluate', headers: { Authorization: `Bearer ${apiKey}` }, payload }),
    ]);

    const v1 = parse(r1).data.value;
    const v2 = parse(r2).data.value;
    const v3 = parse(r3).data.value;
    expect(v1).toBe(v2);
    expect(v2).toBe(v3);
  });

  // Cycle 5: 50% rollout distributes ~half
  it('50% rollout assigns ~50% of users to true', async () => {
    const { id: tenantId, api_key: apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'half');
    await enableFlag(tenantId, apiKey, 'half', 'production', {
      rolloutPercentage: 50,
    });

    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/evaluate',
          headers: { Authorization: `Bearer ${apiKey}` },
          payload: { environment: 'production', flagKey: 'half', userId: `user-${i}` },
        }),
      ),
    );

    const trueCount = results.filter((r) => parse(r).data.value === true).length;
    expect(trueCount).toBeGreaterThanOrEqual(35);
    expect(trueCount).toBeLessThanOrEqual(65);
  });

  // Cycle 6: user override — specific user forced to true regardless of rollout
  it('user override forces specific user to override value', async () => {
    const { id: tenantId, api_key: apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'checkout');
    await enableFlag(tenantId, apiKey, 'checkout', 'production', {
      rolloutPercentage: 0,
      rules: { userOverrides: { alice: true } },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluate',
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { environment: 'production', flagKey: 'checkout', userId: 'alice' },
    });

    const { data } = parse(res);
    expect(data.value).toBe(true);
    expect(data.reason).toBe('USER_OVERRIDE');
  });

  // Cycle 7: context rule matches — premium users get flag
  it('context rule eq — matching user gets flag', async () => {
    const { id: tenantId, api_key: apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'premium-feature');
    await enableFlag(tenantId, apiKey, 'premium-feature', 'production', {
      rolloutPercentage: 0,
      rules: {
        contextRules: [
          { field: 'plan', operator: 'eq', value: 'premium', rolloutPercentage: 100 },
        ],
      },
    });

    const premiumRes = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluate',
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: {
        environment: 'production',
        flagKey: 'premium-feature',
        userId: 'user-1',
        context: { plan: 'premium' },
      },
    });
    const freeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluate',
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: {
        environment: 'production',
        flagKey: 'premium-feature',
        userId: 'user-2',
        context: { plan: 'free' },
      },
    });

    expect(parse(premiumRes).data.reason).toBe('CONTEXT_RULE');
    expect(parse(freeRes).data.value).toBe(false);
  });

  // Cycle 8: bulk evaluate returns object keyed by flag
  it('POST /evaluate/bulk → returns object with all active flag values', async () => {
    const { id: tenantId, api_key: apiKey } = await createTenant('test-app');
    await createFlag(tenantId, apiKey, 'flag-a');
    await createFlag(tenantId, apiKey, 'flag-b');
    await enableFlag(tenantId, apiKey, 'flag-a', 'production', {
      rolloutPercentage: 100,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluate/bulk',
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { environment: 'production', userId: 'bulk-user' },
    });

    expect(res.statusCode).toBe(200);
    const { success, data } = parse(res);
    expect(success).toBe(true);
    expect(typeof data).toBe('object');
    expect(Object.keys(data)).toContain('flag-a');
    expect(Object.keys(data)).toContain('flag-b');
    expect(data['flag-a']).toBe(true);
    expect(data['flag-b']).toBe(false);
  });

  // Cycle 9: evaluate unknown flag → 404
  it('evaluate unknown flag → 404 NOT_FOUND', async () => {
    const { id: tenantId, api_key: apiKey } = await createTenant('test-app');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/evaluate',
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: {
        environment: 'production',
        flagKey: 'no-such-flag',
        userId: 'u1',
      },
    });

    expect(res.statusCode).toBe(404);
    expect(parse(res).error.code).toBe('NOT_FOUND');
  });
});
