# Feature Flag Service

Multi-tenant feature flag and configuration service — simplified LaunchDarkly. Centralized flag management with percentage-based rollouts, targeting rules, environment scoping, and an append-only audit trail.

## Quick Start

```bash
# Start Postgres + Redis
docker compose up db redis -d

# Install deps + run migrations
make setup

# Start in watch mode
make dev

# Verify
curl http://localhost:3000/health
# → {"success":true,"data":{"status":"ok","timestamp":"..."}}
```

Swagger UI: http://localhost:3000/api/docs

## Architecture

```
Client
  │  Bearer ff-<api-key>
  ▼
NestJS / Fastify
  ├── ApiKeyGuard    — SHA-256 key lookup, attaches tenant to request
  ├── ThrottlerGuard — 100 req/min per tenant (in-memory; Redis upgrade path documented)
  ├── Correlation ID — X-Request-ID echo on every response
  └── TransformInterceptor — { success, data } envelope on all responses
  │
  ├─► FlagsService     — CRUD, soft-delete, cache invalidation
  ├─► EvaluationService — rule engine + Redis cache (60 s TTL)
  └─► AuditService      — append-only change log
       │
PostgreSQL (Prisma)   Redis (ioredis)
```

**Evaluation chain** (priority order):

1. Flag disabled → `DISABLED`, return `defaultValue`
2. User in `rules.userOverrides` → `USER_OVERRIDE`
3. Context matches a `rules.contextRules` entry → `CONTEXT_RULE`
4. `sha256(flagKey + userId) % 100 < rolloutPercentage` → `ROLLOUT`
5. Fallback → `DEFAULT`, return `defaultValue`

## Design Decisions

| Decision | Choice | Trade-off |
|----------|--------|-----------|
| Framework | NestJS + Fastify | Fastify adapter ~2× throughput over Express; modules/guards map naturally to multi-tenancy |
| ORM | Prisma | Schema-first = self-documenting migrations; slight overhead vs raw SQL |
| Multi-tenancy | Shared DB + `tenantId` | Simple, horizontally scalable. Weaker isolation than schema-per-tenant — mitigated by application-level guards on every query |
| Compute | Cloud Run | Built-in traffic splitting = canary for free; no cluster management |
| Caching | Redis flag definitions | Cache per `{tenantId, environment}` not per-user result; ~60 s TTL; invalidated on any flag mutation |
| Hashing | `sha256(flagKey + userId) % 100` | Deterministic, uniform, zero dependencies, sticky assignment across instances |
| Auth | API key SHA-256, returned once | Raw key never stored; hash stored |
| Rate limiting | `@nestjs/throttler` in-memory | Works on single instance; Redis store upgrade path requires swapping `ThrottlerStorageRedisService` in `app.module.ts` |

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Health check |
| GET | `/api/docs` | — | Swagger UI |
| POST | `/api/v1/tenants` | — | Create tenant (API key returned once) |
| POST | `/api/v1/tenants/:id/flags` | Bearer | Create flag |
| GET | `/api/v1/tenants/:id/flags` | Bearer | List flags (`?environment=` `?status=active\|archived`) |
| PUT | `/api/v1/tenants/:id/flags/:key` | Bearer | Configure flag for environment |
| DELETE | `/api/v1/tenants/:id/flags/:key` | Bearer | Archive flag (soft-delete) |
| GET | `/api/v1/tenants/:id/flags/:key/history` | Bearer | Audit trail |
| POST | `/api/v1/evaluate` | Bearer | Evaluate single flag |
| POST | `/api/v1/evaluate/bulk` | Bearer | Evaluate all active flags |

Example:

```bash
# Create tenant
TENANT=$(curl -s -X POST http://localhost:3000/api/v1/tenants \
  -H 'Content-Type: application/json' \
  -d '{"name":"acme"}' | jq -r '.data')
ID=$(echo $TENANT | jq -r '.id')
KEY=$(echo $TENANT | jq -r '.api_key')

# Create flag
curl -s -X POST http://localhost:3000/api/v1/tenants/$ID/flags \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"key":"dark-mode","name":"Dark Mode","type":"boolean","defaultValue":false}'

# Enable at 50% rollout
curl -s -X PUT http://localhost:3000/api/v1/tenants/$ID/flags/dark-mode \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"environment":"production","enabled":true,"rolloutPercentage":50}'

# Evaluate
curl -s -X POST http://localhost:3000/api/v1/evaluate \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"environment":"production","flagKey":"dark-mode","userId":"alice"}'
```

## Database Schema

```
tenants            flags              flag_environments
──────────         ──────────         ─────────────────
id (PK)            id (PK)            id (PK)
name (unique)      tenantId → tenants flagId → flags
apiKeyHash         key (unique/tenant) environmentId
createdAt          name               enabled
updatedAt          type               rolloutPercentage
                   defaultValue       rules (JSONB)
                   archivedAt         updatedAt

environments                          audit_logs
────────────                          ──────────
id (PK)                               id (PK)
tenantId → tenants                    tenantId
name (dev/staging/prod)               flagId
                                      environmentId
                                      action (created/updated/archived)
                                      changedBy
                                      oldValue (JSON)
                                      newValue (JSON)
                                      createdAt
```

## Infrastructure (GCP)

```
Artifact Registry → Cloud Run (us-central1)
                         │ VPC connector
                    ┌────┴────┐
               Cloud SQL    Memorystore
               Postgres 16  Redis 7
                    │
              Secret Manager
              (DATABASE_URL, REDIS_URL)
```

Managed via Terraform in `terraform/environments/{staging,production}/`.

**Canary deployment** — `deploy.yml` splits traffic 10% new / 90% stable on `v*` tags. Promote with `gcloud run services update-traffic ... --to-latest`, rollback with `--to-revisions=STABLE=100`.

## Testing

```bash
make test           # unit tests
make test-e2e       # integration tests (requires DB + Redis)
make test-api       # Postman/Newman collection (requires running app)
make load-test      # k6 load test (requires k6 + running app + LOAD_TEST_API_KEY)
```

35 e2e tests cover: tenant CRUD, flag CRUD, evaluation engine (determinism, distribution, rules), audit trail, tenant isolation.

### Load Test Results (GCP staging, Cloud Run + Cloud SQL + Redis)

k6, 4-stage ramp: 20 → 50 → 100 VUs → 0, 2m30s total, `POST /evaluate/bulk`

| Metric | Result | Threshold |
|--------|--------|-----------|
| p(95) latency | **399 ms** | < 500 ms ✓ |
| p(99) latency | **503 ms** | < 1000 ms ✓ |
| Error rate | **0.00%** | < 1% ✓ |
| Throughput | **~80 req/s** | — |
| Total requests | **11,969** | — |

Cold-start spike: max 29.4 s on first requests (Cloud Run min-instances=0); median steady-state 292 ms.

## Security

- API keys hashed with SHA-256 — raw key never stored
- Secrets managed via GCP Secret Manager
- Tenant isolation enforced in every query and controller guard
- Input validation via `class-validator` (whitelist + forbidNonWhitelisted)
- Helmet headers on all responses
- Rate limiting: 100 req/min per tenant (in-memory; Redis store for multi-instance)
- Non-root Docker container (uid 1001)
- Parameterized queries via Prisma

## Future Improvements

- Admin authentication for tenant creation
- SSE/WebSocket flag updates (Redis Pub/Sub → Cloud Run instances)
- Rotate DB credentials via Secret Manager without downtime
- Schema-per-tenant isolation for compliance environments
- Expand rule engine: segment membership, rule chaining, percentage-within-segment
- Prometheus metrics + Cloud Monitoring dashboard
- Multi-region deployment with global load balancer
