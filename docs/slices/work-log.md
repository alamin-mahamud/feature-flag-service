# Work Log

## Slice 0: Foundation — DONE
- NestJS + Fastify, Prisma 6, docker-compose, health endpoint, Dockerfile
- Downgraded Prisma 7→6 (ESM-only incompatible with NestJS CJS)
- Health at `/health`, all APIs under `/api/v1`
- Verify: `docker compose up db redis -d && curl localhost:3000/health`

## Slice 3: Evaluation Engine — DONE
- POST /api/v1/evaluate + POST /api/v1/evaluate/bulk
- Deterministic hashing: sha256(flagKey + userId) % 100 (static method, unit tested)
- Rule engine: disabled → user override → context rules (eq/neq/in) → % rollout → default
- CacheModule (global): ioredis with graceful degradation if Redis not available; 60s TTL
- Cache key: `flags:{tenantId}:{environment}`; invalidated on flag create/update/archive
- Bug fixed: `false ?? true = false` for boolean flags in rollout — added `onValue()` helper for type-aware "on" value
- Added `--runInBand` to test:e2e (e2e suites share DB; parallel runs cause CONFLICT/401 interference)
- 4 unit tests (hash determinism, distribution, range) + 9 e2e integration tests, all GREEN
- Verify: `npx jest --config test/jest-e2e.json --runInBand --testPathPatterns=evaluation`

## Slice 2: Flags CRUD — DONE
- POST/GET/PUT/DELETE on /api/v1/tenants/:id/flags
- Flag creation auto-creates FlagEnvironment for each tenant environment (3 records)
- GET supports ?status=active|archived and ?environment=X (adds enabled/rolloutPercentage)
- PUT updates env settings (enabled, rolloutPercentage, rules)
- DELETE soft-deletes via archivedAt timestamp
- Tenant isolation: assertAccess() in controller throws 403 if API key doesn't match URL tenant
- 11 TDD cycles (9 core + 2 bonus 404s), all GREEN
- Verify: `npx jest --config test/jest-e2e.json --testPathPatterns=flags`

## Slice 1: Tenants — DONE
- POST /api/v1/tenants: generates `ff-` prefixed key, sha256 hash stored in DB
- ApiKeyGuard: Bearer token → hash → DB lookup → attaches tenant to request
- Auto-creates dev/staging/production environments per tenant
- 8 TDD cycles, all GREEN
- Issue: jest-e2e needs `setGlobalPrefix` in test bootstrap (different from main.ts)
- Verify: `npx jest --config test/jest-e2e.json --testPathPatterns=tenants`
