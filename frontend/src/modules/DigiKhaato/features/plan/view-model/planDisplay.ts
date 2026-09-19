import type { ApiErrorShape } from 'src/types/api.types';

import { PLAN_LIMIT_KEYS } from '../types/plan.types';

import type {
  PlanLimit,
  PlanLimitHit,
  PlanLimitKey,
  PlanSupportContact,
} from '../types/plan.types';

/**
 * Part 19 §19.1.1 layer 3 — pure. No React, no Redux, no `react-intl`: the
 * caller passes translated copy in and gets a decision out.
 */

/** FR-8 — the noun that completes "{used} of {limit} {noun}". */
export const nounIdFor = (key: PlanLimitKey | null): string =>
  key ? `plan.noun.${key}` : 'plan.noun.generic';

const isPlanLimitKey = (value: unknown): value is PlanLimitKey =>
  typeof value === 'string' && (PLAN_LIMIT_KEYS as readonly string[]).includes(value);

const firstNumber = (
  details: Readonly<Record<string, readonly string[]>>,
  ...keys: readonly string[]
): number | null => {
  for (const key of keys) {
    const raw = details[key]?.[0];
    if (raw === undefined) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const firstString = (
  details: Readonly<Record<string, readonly string[]>>,
  ...keys: readonly string[]
): string | null => {
  for (const key of keys) {
    const raw = details[key]?.[0];
    if (raw !== undefined) return raw;
  }
  return null;
};

/**
 * FR-4 — a 403 `plan_limit_reached` into the dialog's shape.
 *
 * It reads BOTH documented spellings, because PLT-15 FR-4 and Part 22 §22.1.1
 * disagree about this one envelope:
 *   - FR-4:   `{ limit_key, limit, used, plan_code, support_contact }`
 *   - §22.1.1: `D limit, current, maximum`
 * A dialog that said "You have used null of null parties" because the backend
 * chose the other spelling would be worse than either.
 *
 * `ApiErrorShape.details` is `Record<string, string[]>` by contract, so every
 * value arrives as a string and is parsed here rather than trusted.
 */
export const toPlanLimitHit = (error: ApiErrorShape): PlanLimitHit => {
  const details = error.details;
  const rawKey = firstString(details, 'limit_key');
  return {
    limitKey: isPlanLimitKey(rawKey) ? rawKey : null,
    // §22.1.1 calls the ceiling `maximum`; FR-4 calls it `limit`.
    limit: firstNumber(details, 'limit', 'maximum'),
    // §22.1.1 calls the count `current`; FR-4 calls it `used`.
    used: firstNumber(details, 'used', 'current'),
    planCode: firstString(details, 'plan_code'),
    supportContact: {
      phone: firstString(details, 'support_contact.phone', 'support_phone'),
      whatsapp: firstString(details, 'support_contact.whatsapp', 'support_whatsapp'),
      email: firstString(details, 'support_contact.email', 'support_email'),
      name: firstString(details, 'support_contact.name', 'partner_name'),
    },
    message: error.message,
    requestId: error.requestId,
  };
};

/**
 * FR-6 — the contact action. WhatsApp first because it is the channel these
 * merchants actually use, then a phone call, then email.
 *
 * The text is prefilled with the tenant name and the limit so the partner's
 * support desk does not have to ask two questions before helping. Nothing here
 * is user-entered: §19 requires the contact data to come from the partner
 * record, so a hostile value cannot reach this function.
 */
export interface PlanContactAction {
  readonly channel: 'whatsapp' | 'phone' | 'email';
  readonly href: string;
}

export const planContactAction = (
  contact: PlanSupportContact,
  prefilledText: string
): PlanContactAction | null => {
  if (contact.whatsapp) {
    const digits = contact.whatsapp.replace(/\D/g, '');
    return {
      channel: 'whatsapp',
      href: `https://wa.me/${digits}?text=${encodeURIComponent(prefilledText)}`,
    };
  }
  if (contact.phone) return { channel: 'phone', href: `tel:${contact.phone.replace(/\s/g, '')}` };
  if (contact.email) {
    return {
      channel: 'email',
      href: `mailto:${contact.email}?body=${encodeURIComponent(prefilledText)}`,
    };
  }
  // §9 "Failed" — a partner with no support contact at all. The dialog then
  // says "Contact your provider" and offers no dead link.
  return null;
};

/** 0–100, clamped. `null` (unlimited) is 0: an uncapped meter is never full. */
export const limitPercent = (limit: PlanLimit): number =>
  limit.limit === null || limit.limit <= 0
    ? 0
    : Math.min(100, Math.round((limit.used / limit.limit) * 100));

export const isUnlimited = (limit: PlanLimit): boolean => limit.limit === null;

/** FR-7 — the pre-warning threshold for the member count (DEC-001's one limit). */
export const NEAR_LIMIT_PERCENT = 80;

export const isNearLimit = (limit: PlanLimit): boolean =>
  !isUnlimited(limit) && limitPercent(limit) >= NEAR_LIMIT_PERCENT && limitPercent(limit) < 100;

export const isAtLimit = (limit: PlanLimit): boolean =>
  !isUnlimited(limit) && limitPercent(limit) >= 100;

export const findLimit = (limits: readonly PlanLimit[], key: PlanLimitKey): PlanLimit | null =>
  limits.find((limit) => limit.key === key) ?? null;
