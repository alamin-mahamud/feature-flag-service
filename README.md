# Feature Flag Service

Multi-tenant feature flag and configuration service. Think simplified LaunchDarkly — centralized feature flag management with percentage-based rollouts, environment scoping, and audit trails.

## Quick Start

```bash
# Start Postgres + Redis
docker compose up db redis -d

# Install deps + run migrations
npm install
npx prisma migrate dev

# Start the app
npm run start:dev

# Verify
curl http://localhost:3000/health
```

## Design Decisions

- **NestJS + Fastify** — spec-recommended framework; modules/guards/interceptors map naturally to multi-tenancy
- **Prisma** — schema-first ORM, schema file serves as living documentation
- **Shared DB + tenant_id** — same approach as LaunchDarkly at scale. Simpler than schema-per-tenant. Trade-off: weaker isolation, mitigated by application-level guards on every query
- **Cloud Run** — built-in traffic splitting = canary deployment for free. Saves hours vs GKE for a single service
- **Redis** — cache flag definitions per tenant+environment (not per-user results). Few keys, simple invalidation
- **sha256 hashing** — deterministic percentage rollouts via `sha256(flag_key + user_id) % 100`. Built-in Node.js crypto, zero deps

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/api/v1/tenants` | No | Create tenant (returns API key once) |
| POST | `/api/v1/tenants/:id/flags` | API Key | Create feature flag |
| GET | `/api/v1/tenants/:id/flags` | API Key | List flags (filter by environment, status) |
| PUT | `/api/v1/tenants/:id/flags/:key` | API Key | Update flag |
| DELETE | `/api/v1/tenants/:id/flags/:key` | API Key | Archive flag (soft-delete) |
| GET | `/api/v1/tenants/:id/flags/:key/history` | API Key | Audit log for flag |
| POST | `/api/v1/evaluate` | API Key | Evaluate flag for user |
| POST | `/api/v1/evaluate/bulk` | API Key | Evaluate all flags for user |

## Future Improvements (Before Production)

- Admin authentication for tenant creation endpoint
- SSE/WebSocket for real-time flag change distribution (architecture: Redis Pub/Sub fan-out to Cloud Run instances)
- Database credential rotation via GCP Secret Manager
- Schema-per-tenant isolation for compliance-heavy environments
- Rule engine expansion: segments, rule chaining, priority ordering
