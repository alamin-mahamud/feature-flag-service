# Work Log (local only — not committed)

## Slice 0: Foundation — DONE
- NestJS + Fastify, Prisma 6, docker-compose, health endpoint, Dockerfile
- Downgraded Prisma 7→6 (ESM-only incompatible with NestJS CJS)
- Health at `/health`, all APIs under `/api/v1`
- Verify: `docker compose up db redis -d && curl localhost:3000/health`

## Slice 1: Tenants — DONE
- POST /api/v1/tenants: generates `ff-` prefixed key, sha256 hash stored in DB
- ApiKeyGuard: Bearer token → hash → DB lookup → attaches tenant to request
- Auto-creates dev/staging/production environments per tenant
- 8 TDD cycles, all GREEN
- Issue: jest-e2e needs `setGlobalPrefix` in test bootstrap (different from main.ts)
- Verify: `npx jest --config test/jest-e2e.json --testPathPatterns=tenants`
