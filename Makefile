.DEFAULT_GOAL := help

# ─── Setup ────────────────────────────────────────────────────────────────────

.PHONY: install
install: ## Install dependencies
	npm install

.PHONY: setup
setup: install db-up db-migrate ## Full local setup (install + start DB + migrate)
	@echo "Ready. Run: make dev"

# ─── Dev ──────────────────────────────────────────────────────────────────────

.PHONY: dev
dev: ## Start app in watch mode (requires DB running)
	npm run start:dev

.PHONY: start
start: ## Start app (production mode, compiled)
	npm run start:prod

.PHONY: build
build: ## Compile TypeScript
	npm run build

# ─── Database ─────────────────────────────────────────────────────────────────

.PHONY: db-up
db-up: ## Start Postgres + Redis containers
	docker compose up db redis -d

.PHONY: db-down
db-down: ## Stop Postgres + Redis containers
	docker compose stop db redis

.PHONY: db-migrate
db-migrate: ## Run pending migrations
	npx prisma migrate dev

.PHONY: db-migrate-prod
db-migrate-prod: ## Apply migrations in production (no prompt)
	npx prisma migrate deploy

.PHONY: db-studio
db-studio: ## Open Prisma Studio (DB browser)
	npx prisma studio

.PHONY: db-reset
db-reset: ## ⚠ Reset local DB and re-run all migrations (destroys data)
	PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes" npx prisma migrate reset --force

.PHONY: db-seed
db-seed: ## Populate DB with demo tenants, flags and configs
	npm run db:seed

.PHONY: db-generate
db-generate: ## Regenerate Prisma client after schema changes
	npx prisma generate

# ─── Testing ──────────────────────────────────────────────────────────────────

.PHONY: test
test: ## Run unit tests
	npm run test

.PHONY: test-watch
test-watch: ## Run unit tests in watch mode
	npm run test:watch

.PHONY: test-e2e
test-e2e: ## Run all integration (e2e) tests serially (requires DB running)
	npx jest --config test/jest-e2e.json --runInBand

.PHONY: test-e2e-watch
test-e2e-watch: ## Run e2e tests in watch mode
	npx jest --config test/jest-e2e.json --watch

.PHONY: test-cov
test-cov: ## Run unit tests with coverage report
	npm run test:cov

.PHONY: test-all
test-all: test test-e2e ## Run unit + integration tests

.PHONY: load-test
load-test: ## Run k6 load test against /evaluate/bulk (requires k6 + running app)
	k6 run test/load/evaluate.js

.PHONY: test-api
test-api: ## Run Postman collection via Newman (requires app running + npm install -g newman)
	newman run docs/feature-flag-service.postman_collection.json

# ─── Code Quality ─────────────────────────────────────────────────────────────

.PHONY: lint
lint: ## Lint and auto-fix
	npm run lint

.PHONY: format
format: ## Format with Prettier
	npm run format

# ─── Docker ───────────────────────────────────────────────────────────────────

.PHONY: docker-build
docker-build: ## Build production Docker image
	docker build -t feature-flag-service:local .

.PHONY: docker-run
docker-run: ## Run production image locally (requires DB + Redis running)
	docker run --rm \
		--network host \
		-e DATABASE_URL=postgresql://postgres:postgres@localhost:5432/feature_flags \
		-e REDIS_URL=redis://localhost:6379 \
		-p 3000:3000 \
		feature-flag-service:local

.PHONY: up
up: ## Start full stack (API + DB + Redis) via docker compose
	docker compose up --build

.PHONY: down
down: ## Stop and remove all containers (data preserved)
	docker compose down

.PHONY: down-clean
down-clean: ## ⚠ Stop containers AND delete volumes (all data lost)
	docker compose down -v

.PHONY: logs
logs: ## Follow API logs
	docker compose logs -f api

# ─── Utilities ────────────────────────────────────────────────────────────────

.PHONY: health
health: ## Check if app is running
	@curl -sf http://localhost:3000/health | python3 -m json.tool || echo "App not running"

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf dist coverage

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
