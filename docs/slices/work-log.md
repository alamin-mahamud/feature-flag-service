# Work Log (local only — not committed)

## Slice 0: Foundation — DONE
- NestJS + Fastify, Prisma 6, docker-compose, health endpoint, Dockerfile
- Downgraded Prisma 7→6 (ESM-only incompatible with NestJS CJS)
- Health at `/health`, all APIs under `/api/v1`
- Verify: `docker compose up db redis -d && curl localhost:3000/health`

## Slice 1: Tenants — IN PROGRESS
