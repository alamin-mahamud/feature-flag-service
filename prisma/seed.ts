import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

const ENVIRONMENTS = ['development', 'staging', 'production'];

function makeApiKey(): { raw: string; hash: string } {
  const raw = `ff-${randomBytes(32).toString('hex')}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

async function main() {
  console.log('Seeding database...');

  await prisma.tenant.deleteMany();

  // ── Tenant 1: acme-corp ──────────────────────────────────────────────────
  const acmeKey = makeApiKey();
  const acme = await prisma.tenant.create({
    data: {
      name: 'acme-corp',
      apiKeyHash: acmeKey.hash,
      environments: { create: ENVIRONMENTS.map((name) => ({ name })) },
    },
    include: { environments: true },
  });

  const acmeEnvMap = Object.fromEntries(acme.environments.map((e) => [e.name, e.id]));

  // Flag 1: dark-mode — 20% rollout in production, 100% in staging
  const darkMode = await prisma.flag.create({
    data: {
      tenantId: acme.id,
      key: 'dark-mode',
      name: 'Dark Mode',
      description: 'Enable dark UI theme for opted-in users',
      type: 'boolean',
    },
  });
  await prisma.flagEnvironment.createMany({
    data: [
      { flagId: darkMode.id, environmentId: acmeEnvMap['development'], enabled: true, defaultValue: false, rolloutPercentage: 100 },
      { flagId: darkMode.id, environmentId: acmeEnvMap['staging'],     enabled: true, defaultValue: false, rolloutPercentage: 100 },
      { flagId: darkMode.id, environmentId: acmeEnvMap['production'],  enabled: true, defaultValue: false, rolloutPercentage: 20 },
    ],
  });

  // Flag 2: new-checkout — premium users always get it via context rule
  const newCheckout = await prisma.flag.create({
    data: {
      tenantId: acme.id,
      key: 'new-checkout',
      name: 'New Checkout Flow',
      description: 'Redesigned checkout experience',
      type: 'boolean',
    },
  });
  const checkoutRules = {
    userOverrides: { 'alice@acme.com': true, 'blocked-user': false },
    contextRules: [
      { field: 'plan', operator: 'eq', value: 'premium', rolloutPercentage: 100 },
      { field: 'country', operator: 'in', value: ['BD', 'IN', 'SG'], rolloutPercentage: 50 },
    ],
  };
  await prisma.flagEnvironment.createMany({
    data: [
      { flagId: newCheckout.id, environmentId: acmeEnvMap['development'], enabled: true, defaultValue: false, rolloutPercentage: 100 },
      { flagId: newCheckout.id, environmentId: acmeEnvMap['staging'],     enabled: true, defaultValue: false, rolloutPercentage: 50 },
      { flagId: newCheckout.id, environmentId: acmeEnvMap['production'],  enabled: true, defaultValue: false, rolloutPercentage: 10, rules: checkoutRules },
    ],
  });

  // Flag 3: pricing-layout — string flag (A/B test variant)
  const pricingLayout = await prisma.flag.create({
    data: {
      tenantId: acme.id,
      key: 'pricing-layout',
      name: 'Pricing Page Layout',
      description: 'A/B test: control vs table variant',
      type: 'string',
    },
  });
  await prisma.flagEnvironment.createMany({
    data: [
      { flagId: pricingLayout.id, environmentId: acmeEnvMap['development'], enabled: true, defaultValue: 'table',   rolloutPercentage: 100 },
      { flagId: pricingLayout.id, environmentId: acmeEnvMap['staging'],     enabled: true, defaultValue: 'table',   rolloutPercentage: 100 },
      { flagId: pricingLayout.id, environmentId: acmeEnvMap['production'],  enabled: true, defaultValue: 'control', rolloutPercentage: 50 },
    ],
  });

  // Flag 4: max-upload-mb — number flag
  const maxUpload = await prisma.flag.create({
    data: {
      tenantId: acme.id,
      key: 'max-upload-mb',
      name: 'Max Upload Size (MB)',
      description: 'Controls per-user upload limit',
      type: 'number',
    },
  });
  await prisma.flagEnvironment.createMany({
    data: [
      { flagId: maxUpload.id, environmentId: acmeEnvMap['development'], enabled: true, defaultValue: 100 },
      { flagId: maxUpload.id, environmentId: acmeEnvMap['staging'],     enabled: true, defaultValue: 50 },
      { flagId: maxUpload.id, environmentId: acmeEnvMap['production'],  enabled: true, defaultValue: 10 },
    ],
  });

  // Flag 5: old-nav — archived (soft-deleted)
  const oldNav = await prisma.flag.create({
    data: {
      tenantId: acme.id,
      key: 'old-nav',
      name: 'Old Navigation',
      description: 'Legacy nav — fully replaced',
      type: 'boolean',
      archivedAt: new Date(),
    },
  });
  await prisma.flagEnvironment.createMany({
    data: ENVIRONMENTS.map((env) => ({
      flagId: oldNav.id,
      environmentId: acmeEnvMap[env],
      enabled: false,
      defaultValue: false,
    })),
  });

  // ── Tenant 2: startup-demo ───────────────────────────────────────────────
  const startupKey = makeApiKey();
  const startup = await prisma.tenant.create({
    data: {
      name: 'startup-demo',
      apiKeyHash: startupKey.hash,
      environments: { create: ENVIRONMENTS.map((name) => ({ name })) },
    },
    include: { environments: true },
  });

  const startupEnvMap = Object.fromEntries(startup.environments.map((e) => [e.name, e.id]));

  // Flag: beta-feature — 0% in prod (kill-switch style)
  const betaFeature = await prisma.flag.create({
    data: {
      tenantId: startup.id,
      key: 'beta-feature',
      name: 'Beta Feature',
      description: 'Experimental feature — not ready for production',
      type: 'boolean',
    },
  });
  await prisma.flagEnvironment.createMany({
    data: [
      { flagId: betaFeature.id, environmentId: startupEnvMap['development'], enabled: true,  defaultValue: false, rolloutPercentage: 100 },
      { flagId: betaFeature.id, environmentId: startupEnvMap['staging'],     enabled: true,  defaultValue: false, rolloutPercentage: 100 },
      { flagId: betaFeature.id, environmentId: startupEnvMap['production'],  enabled: false, defaultValue: false },
    ],
  });

  console.log('\n✓ Seeded successfully\n');
  console.log('Tenants:');
  console.log(`  acme-corp     API key: ${acmeKey.raw}`);
  console.log(`  startup-demo  API key: ${startupKey.raw}`);
  console.log('\nTo evaluate a flag:');
  console.log(`  curl -X POST http://localhost:3000/api/v1/evaluate \\`);
  console.log(`    -H "Authorization: Bearer ${acmeKey.raw}" \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"environment":"production","flagKey":"dark-mode","userId":"user-123"}'`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
