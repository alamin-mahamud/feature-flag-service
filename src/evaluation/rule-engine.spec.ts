import { computeBucket, evaluate, FlagInput } from './rule-engine';

// ─── helpers ────────────────────────────────────────────────────────────────

function flag(overrides: Partial<FlagInput> = {}): FlagInput {
  return {
    key: 'test-flag',
    type: 'boolean',
    enabled: true,
    defaultValue: false,
    rolloutPercentage: null,
    rules: null,
    ...overrides,
  };
}

// ─── computeBucket ──────────────────────────────────────────────────────────

describe('computeBucket', () => {
  it('same inputs always produce same bucket (determinism)', () => {
    expect(computeBucket('dark-mode', 'user-123')).toBe(
      computeBucket('dark-mode', 'user-123'),
    );
  });

  it('result is always in [0, 99]', () => {
    for (let i = 0; i < 200; i++) {
      const b = computeBucket(`flag-${i}`, `user-${i}`);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(99);
    }
  });

  it('different users produce spread of buckets', () => {
    const buckets = new Set(
      Array.from({ length: 30 }, (_, i) =>
        computeBucket('my-flag', `user-${i}`),
      ),
    );
    expect(buckets.size).toBeGreaterThan(15);
  });

  it('10% rollout covers ~10% of users (distribution)', () => {
    const count = Array.from({ length: 1000 }, (_, i) =>
      computeBucket('rollout-flag', `user-${i}`),
    ).filter((b) => b < 10).length;
    expect(count).toBeGreaterThanOrEqual(60);
    expect(count).toBeLessThanOrEqual(140);
  });

  // ── Consistent-hashing properties ──────────────────────────────────────────

  it('monotonic rollout: users included at a lower % are always included at a higher %', () => {
    // This is the core "consistent" guarantee: increasing rolloutPercentage
    // only ever ADDS users to the included set — it never ejects users who
    // were already in. Verified by checking that the included set at each
    // threshold is a superset of every smaller threshold.
    const users = Array.from({ length: 1000 }, (_, i) => `user-${i}`);
    const thresholds = [10, 25, 50, 75];

    const includedAt = (pct: number) =>
      new Set(users.filter((u) => computeBucket('ramp-flag', u) < pct));

    for (let i = 0; i < thresholds.length - 1; i++) {
      const smaller = includedAt(thresholds[i]);
      const larger = includedAt(thresholds[i + 1]);
      // Every user included at the smaller threshold must also be in the larger.
      smaller.forEach((u) => expect(larger.has(u)).toBe(true));
      // The larger set must have grown.
      expect(larger.size).toBeGreaterThan(smaller.size);
    }
  });

  it('flag-key independence: bucket assignments across different flags are uncorrelated', () => {
    // A user in the 0–30 bucket for flag-a should not be systematically more
    // likely to also be in 0–30 for flag-b. Test by comparing observed
    // overlap to expected overlap under independence (30% × 30% = ~9%).
    const N = 1000;
    const users = Array.from({ length: N }, (_, i) => `user-${i}`);

    const inFlagA = new Set(users.filter((u) => computeBucket('flag-a', u) < 30));
    const inFlagB = new Set(users.filter((u) => computeBucket('flag-b', u) < 30));
    const overlap = users.filter((u) => inFlagA.has(u) && inFlagB.has(u)).length;

    // Under independence, expected overlap ≈ 0.3 × 0.3 × 1000 = 90.
    // Allow ±50% tolerance (45–135) to avoid flakiness.
    expect(overlap).toBeGreaterThanOrEqual(45);
    expect(overlap).toBeLessThanOrEqual(135);
  });

  it('hash regression: known flag+user pairs produce stable bucket values', () => {
    // If the hash function ever changes (algorithm, encoding, input format),
    // these will fail — a deliberate break of existing user assignments.
    expect(computeBucket('dark-mode', 'alice')).toBe(72);
    expect(computeBucket('dark-mode', 'bob')).toBe(50);
    expect(computeBucket('checkout-v2', 'alice')).toBe(90);
    expect(computeBucket('checkout-v2', 'bob')).toBe(69);
    expect(computeBucket('dark-mode', 'user-42')).toBe(18);
  });
});

// ─── evaluate: disabled ─────────────────────────────────────────────────────

describe('evaluate — disabled flag', () => {
  it('disabled flag returns defaultValue with reason DISABLED', () => {
    const result = evaluate(
      flag({ enabled: false, defaultValue: false }),
      'u1',
      {},
    );
    expect(result).toEqual({ value: false, reason: 'DISABLED' });
  });

  it('disabled flag ignores rollout percentage', () => {
    const result = evaluate(
      flag({ enabled: false, rolloutPercentage: 100 }),
      'u1',
      {},
    );
    expect(result.reason).toBe('DISABLED');
  });

  it('disabled flag returns non-false defaultValue as-is', () => {
    const result = evaluate(
      flag({ enabled: false, type: 'string', defaultValue: 'control' }),
      'u1',
      {},
    );
    expect(result.value).toBe('control');
  });
});

// ─── evaluate: user overrides ───────────────────────────────────────────────

describe('evaluate — user overrides', () => {
  it('overridden user gets override value true, reason USER_OVERRIDE', () => {
    const result = evaluate(
      flag({ rolloutPercentage: 0, rules: { userOverrides: { alice: true } } }),
      'alice',
      {},
    );
    expect(result).toEqual({ value: true, reason: 'USER_OVERRIDE' });
  });

  it('overridden user false value wins over rollout', () => {
    const result = evaluate(
      flag({
        rolloutPercentage: 100,
        rules: { userOverrides: { bob: false } },
      }),
      'bob',
      {},
    );
    expect(result).toEqual({ value: false, reason: 'USER_OVERRIDE' });
  });

  it('non-overridden user falls through to rollout', () => {
    const result = evaluate(
      flag({
        rolloutPercentage: 100,
        rules: { userOverrides: { alice: true } },
      }),
      'charlie',
      {},
    );
    expect(result.reason).toBe('ROLLOUT');
  });
});

// ─── evaluate: context rules ────────────────────────────────────────────────

describe('evaluate — context rules', () => {
  it('eq operator: matching context field returns CONTEXT_RULE', () => {
    const result = evaluate(
      flag({
        rolloutPercentage: 0,
        rules: {
          contextRules: [
            {
              field: 'plan',
              operator: 'eq',
              value: 'premium',
              rolloutPercentage: 100,
            },
          ],
        },
      }),
      'u1',
      { plan: 'premium' },
    );
    expect(result.reason).toBe('CONTEXT_RULE');
    expect(result.value).toBe(true);
  });

  it('eq operator: non-matching context falls through to DEFAULT', () => {
    const result = evaluate(
      flag({
        rolloutPercentage: 0,
        rules: {
          contextRules: [
            {
              field: 'plan',
              operator: 'eq',
              value: 'premium',
              rolloutPercentage: 100,
            },
          ],
        },
      }),
      'u1',
      { plan: 'free' },
    );
    expect(result.reason).toBe('DEFAULT');
  });

  it('neq operator: matches when field does NOT equal value', () => {
    const result = evaluate(
      flag({
        rolloutPercentage: 0,
        rules: {
          contextRules: [
            {
              field: 'plan',
              operator: 'neq',
              value: 'free',
              rolloutPercentage: 100,
            },
          ],
        },
      }),
      'u1',
      { plan: 'premium' },
    );
    expect(result.reason).toBe('CONTEXT_RULE');
  });

  it('in operator: matches when context value is in list', () => {
    const result = evaluate(
      flag({
        rolloutPercentage: 0,
        rules: {
          contextRules: [
            {
              field: 'country',
              operator: 'in',
              value: ['BD', 'IN', 'PK'],
              rolloutPercentage: 100,
            },
          ],
        },
      }),
      'u1',
      { country: 'BD' },
    );
    expect(result.reason).toBe('CONTEXT_RULE');
  });

  it('in operator: no match when value not in list', () => {
    const result = evaluate(
      flag({
        rolloutPercentage: 0,
        rules: {
          contextRules: [
            {
              field: 'country',
              operator: 'in',
              value: ['BD', 'IN'],
              rolloutPercentage: 100,
            },
          ],
        },
      }),
      'u1',
      { country: 'US' },
    );
    expect(result.reason).toBe('DEFAULT');
  });

  it('context rule with 0% rolloutPercentage never fires', () => {
    const result = evaluate(
      flag({
        rolloutPercentage: 0,
        rules: {
          contextRules: [
            {
              field: 'plan',
              operator: 'eq',
              value: 'premium',
              rolloutPercentage: 0,
            },
          ],
        },
      }),
      'u1',
      { plan: 'premium' },
    );
    expect(result.reason).not.toBe('CONTEXT_RULE');
  });

  it('context rule missing field does not match', () => {
    const result = evaluate(
      flag({
        rolloutPercentage: 0,
        rules: {
          contextRules: [
            {
              field: 'plan',
              operator: 'eq',
              value: 'premium',
              rolloutPercentage: 100,
            },
          ],
        },
      }),
      'u1',
      {},
    );
    expect(result.reason).toBe('DEFAULT');
  });
});

// ─── evaluate: rollout percentage ───────────────────────────────────────────

describe('evaluate — rollout percentage', () => {
  it('100% rollout always returns true for boolean flags', () => {
    for (let i = 0; i < 20; i++) {
      const result = evaluate(
        flag({ rolloutPercentage: 100 }),
        `user-${i}`,
        {},
      );
      expect(result).toEqual({ value: true, reason: 'ROLLOUT' });
    }
  });

  it('0% rollout always returns DEFAULT', () => {
    for (let i = 0; i < 20; i++) {
      const result = evaluate(flag({ rolloutPercentage: 0 }), `user-${i}`, {});
      expect(result.reason).toBe('DEFAULT');
    }
  });

  it('50% rollout assigns ~50% of 1000 users to ROLLOUT', () => {
    const rolloutCount = Array.from({ length: 1000 }, (_, i) =>
      evaluate(flag({ rolloutPercentage: 50 }), `user-${i}`, {}),
    ).filter((r) => r.reason === 'ROLLOUT').length;
    expect(rolloutCount).toBeGreaterThanOrEqual(400);
    expect(rolloutCount).toBeLessThanOrEqual(600);
  });

  it('same user always gets the same rollout result', () => {
    const results = Array.from({ length: 5 }, () =>
      evaluate(flag({ rolloutPercentage: 50 }), 'fixed-user', {}),
    );
    expect(new Set(results.map((r) => r.reason)).size).toBe(1);
  });
});

// ─── evaluate: flag types ───────────────────────────────────────────────────

describe('evaluate — flag types', () => {
  it('boolean flag in rollout returns true', () => {
    const result = evaluate(
      flag({ type: 'boolean', defaultValue: false, rolloutPercentage: 100 }),
      'u1',
      {},
    );
    expect(result.value).toBe(true);
  });

  it('string flag in rollout returns defaultValue (no variant stored)', () => {
    const result = evaluate(
      flag({ type: 'string', defaultValue: 'control', rolloutPercentage: 100 }),
      'u1',
      {},
    );
    expect(result.value).toBe('control');
  });

  it('number flag in rollout returns defaultValue', () => {
    const result = evaluate(
      flag({ type: 'number', defaultValue: 42, rolloutPercentage: 100 }),
      'u1',
      {},
    );
    expect(result.value).toBe(42);
  });

  it('disabled boolean flag returns false default', () => {
    const result = evaluate(
      flag({ type: 'boolean', enabled: false, defaultValue: false }),
      'u1',
      {},
    );
    expect(result.value).toBe(false);
  });
});

// ─── evaluate: priority order ───────────────────────────────────────────────

describe('evaluate — priority order', () => {
  it('user override beats rollout', () => {
    const result = evaluate(
      flag({
        rolloutPercentage: 100,
        rules: { userOverrides: { alice: false } },
      }),
      'alice',
      {},
    );
    expect(result).toEqual({ value: false, reason: 'USER_OVERRIDE' });
  });

  it('user override beats context rule', () => {
    const result = evaluate(
      flag({
        rolloutPercentage: 0,
        rules: {
          userOverrides: { alice: false },
          contextRules: [
            {
              field: 'plan',
              operator: 'eq',
              value: 'premium',
              rolloutPercentage: 100,
            },
          ],
        },
      }),
      'alice',
      { plan: 'premium' },
    );
    expect(result.reason).toBe('USER_OVERRIDE');
  });

  it('context rule beats rollout', () => {
    // alice has a specific context rule; without it she would fall to rollout=0 → DEFAULT
    // With context rule matching → CONTEXT_RULE
    const result = evaluate(
      flag({
        rolloutPercentage: 0,
        rules: {
          contextRules: [
            {
              field: 'plan',
              operator: 'eq',
              value: 'premium',
              rolloutPercentage: 100,
            },
          ],
        },
      }),
      'u1',
      { plan: 'premium' },
    );
    expect(result.reason).toBe('CONTEXT_RULE');
  });
});
