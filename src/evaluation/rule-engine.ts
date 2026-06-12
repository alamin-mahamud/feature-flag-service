import { createHash } from 'crypto';

export type FlagType = 'boolean' | 'string' | 'number';

export type ContextRule = {
  field: string;
  operator: 'eq' | 'neq' | 'in';
  value: unknown;
  rolloutPercentage?: number;
};

export type Rules = {
  userOverrides?: Record<string, unknown>;
  contextRules?: ContextRule[];
};

export type FlagInput = {
  key: string;
  type: FlagType;
  enabled: boolean;
  defaultValue: unknown;
  rolloutPercentage: number | null;
  rules: Rules | null;
};

export type EvalReason =
  | 'DISABLED'
  | 'USER_OVERRIDE'
  | 'CONTEXT_RULE'
  | 'ROLLOUT'
  | 'DEFAULT';

export type EvalResult = { value: unknown; reason: EvalReason };

/**
 * Deterministic bucket assignment: sha256(flagKey + userId) % 100 → [0, 99]
 */
export function computeBucket(flagKey: string, userId: string): number {
  return (
    parseInt(
      createHash('sha256')
        .update(flagKey + userId)
        .digest('hex')
        .slice(0, 8),
      16,
    ) % 100
  );
}

/**
 * Evaluate a single flag for a given user + context.
 *
 * Priority order:
 *   1. Disabled flag → return defaultValue (reason: DISABLED)
 *   2. User override → return overridden value (reason: USER_OVERRIDE)
 *   3. Context rules → first matching rule within its rollout % (reason: CONTEXT_RULE)
 *   4. Percentage rollout → user in bucket (reason: ROLLOUT)
 *   5. Default value (reason: DEFAULT)
 */
export function evaluate(
  flag: FlagInput,
  userId: string,
  context: Record<string, unknown>,
): EvalResult {
  // 1. Disabled
  if (!flag.enabled) {
    return { value: flag.defaultValue ?? false, reason: 'DISABLED' };
  }

  const rules = flag.rules;

  // 2. User override
  if (rules?.userOverrides && userId in rules.userOverrides) {
    return { value: rules.userOverrides[userId], reason: 'USER_OVERRIDE' };
  }

  // 3. Context rules
  for (const rule of rules?.contextRules ?? []) {
    if (matchesContextRule(rule, context)) {
      const pct = rule.rolloutPercentage ?? 100;
      if (computeBucket(flag.key, userId) < pct) {
        return { value: onValue(flag), reason: 'CONTEXT_RULE' };
      }
    }
  }

  // 4. Percentage rollout
  if (flag.rolloutPercentage !== null) {
    if (computeBucket(flag.key, userId) < flag.rolloutPercentage) {
      return { value: onValue(flag), reason: 'ROLLOUT' };
    }
  }

  // 5. Default
  return { value: flag.defaultValue ?? false, reason: 'DEFAULT' };
}

function matchesContextRule(
  rule: ContextRule,
  context: Record<string, unknown>,
): boolean {
  const ctxVal = context[rule.field];
  switch (rule.operator) {
    case 'eq':
      return ctxVal === rule.value;
    case 'neq':
      return ctxVal !== rule.value;
    case 'in':
      return Array.isArray(rule.value) && rule.value.includes(ctxVal);
    default:
      return false;
  }
}

/** "On" value: true for boolean flags, defaultValue for string/number */
function onValue(flag: FlagInput): unknown {
  return flag.type === 'boolean' ? true : (flag.defaultValue ?? true);
}
