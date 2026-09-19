import { PASSWORD_FLOOR } from '../constants/authDefaults';

import type { AuthResult, AuthTenant, PostAuthDestination } from '../types/auth.types';

/**
 * Part 19 §19.1.1 layer 3 — pure functions. No React, no Redux, no I/O, no
 * `react-intl`: the caller passes translated copy in and gets a decision out.
 *
 * The routing rule of PLT-01 FR-9 and PLT-04 FR-9 lives here rather than in a
 * component precisely because it has five branches and every one of them is a
 * bug that would otherwise only be found by signing in as five different users.
 */

/**
 * CR-2026-09-19-A did not change this rule. Registration and login produce the
 * same `AuthResult` the OTP verify used to, so the five branches below are
 * untouched — which is the point of having put them here rather than in a
 * component.
 *
 * PLT-01 FR-9 / PLT-04 FR-9, in order of precedence:
 *
 *  1. A brand-new user, or a user with no membership at all, goes to the
 *     onboarding wizard — not to a dashboard that would be empty of everything
 *     including a business (§19.7.3's `no_tenant` status).
 *  2. A user whose ONLY membership is `invited` goes to the acceptance screen
 *     (EC-5); PLT-05 owns that screen, so Sprint 1 routes to the chooser, which
 *     lists the invitation and says what it is.
 *  3. An active tenant whose wizard is unfinished resumes it at `step + 1`
 *     (PLT-03 FR-9).
 *  4. Exactly one active tenant, or a default among several, opens it.
 *  5. Several with no default opens the full-screen chooser.
 */
export const postAuthDestination = (result: AuthResult): PostAuthDestination => {
  const active = result.tenants.filter((tenant) => tenant.status === 'active');
  const invited = result.tenants.filter((tenant) => tenant.status === 'invited');

  if (active.length === 0) {
    if (invited.length > 0) return { kind: 'invitation' };
    return { kind: 'onboarding', step: 1 };
  }

  const chosen = resolveActiveTenant(result.activeTenantId, active);
  if (!chosen) return { kind: 'chooser' };

  if (chosen.onboardingStep !== null && chosen.onboardingStep < 4) {
    return { kind: 'onboarding', step: Math.max(1, chosen.onboardingStep + 1) };
  }
  return { kind: 'app', tenantId: chosen.id };
};

/**
 * PLT-01 EC-5 / PLT-04 FR-8, FR-9 — where a session with NO active tenant
 * belongs. This is `postAuthDestination`'s rule, asked of the session rather
 * than of a login result, because the route guard has to answer it too.
 *
 * `sessionSlice` reports `no_tenant` whenever `activeTenant` is null, and that
 * is three different situations, not one:
 *
 *  - no memberships at all → the wizard, which is what `no_tenant` was written
 *    for;
 *  - an `invited` membership and nothing active → the CHOOSER, which is the
 *    only screen that lists an invitation (EC-5);
 *  - several active memberships with no default → the chooser again (FR-9),
 *    reachable as soon as a default membership's tenant is deleted.
 *
 * `RequireSession` used to send all three to `/onboarding`, so the two latter
 * users were pushed into creating yet another business and the invitation they
 * were sent could never be opened by any account the product can create.
 */
export type NoTenantDestination = 'chooser' | 'onboarding';

export const noTenantDestination = (
  tenants: readonly { readonly status?: string }[]
): NoTenantDestination =>
  tenants.some((tenant) => tenant.status === 'invited' || tenant.status === 'active')
    ? 'chooser'
    : 'onboarding';

/** The active tenant, the default one, or — when several and no default — none. */
export const resolveActiveTenant = (
  activeTenantId: string | null,
  active: readonly AuthTenant[]
): AuthTenant | null => {
  if (activeTenantId) {
    const named = active.find((tenant) => tenant.id === activeTenantId);
    if (named) return named;
  }
  const byDefault = active.find((tenant) => tenant.isDefault);
  if (byDefault) return byDefault;
  return active.length === 1 ? (active[0] ?? null) : null;
};

/**
 * §19.6.4 rule 2 — `next` is validated against a same-origin, leading-slash
 * allow-list BEFORE use. An open redirect on a login screen is a real
 * vulnerability, and "it came from our own query string" is not a defence.
 */
export const safeNextPath = (next: string | null | undefined, fallback: string): string => {
  if (!next) return fallback;
  // A protocol-relative `//evil.com` and a scheme `https://evil.com` both have
  // to fail, and both start with something other than a single `/` + word char.
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (next.includes('://')) return fallback;
  return next;
};

/** Seconds remaining until an absolute deadline; never negative. */
export const secondsUntil = (deadline: number | null, now: number): number =>
  deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));

/** PLT-01 Alternate C — "Try again in {minutes} min"; a part-minute rounds up. */
export const minutesUntil = (deadline: number | null, now: number): number =>
  Math.ceil(secondsUntil(deadline, now) / 60);

// ── PLT-02 §7 — the password strength hint ───────────────────────────────────

export type PasswordStrength = 'weak' | 'fair' | 'strong';

export interface PasswordStrengthView {
  readonly strength: PasswordStrength;
  /** 0–100, for the four-step bar. */
  readonly percent: number;
  readonly labelId: string;
}

/**
 * A HINT, not a gate: `passwordValidation()` decides what is acceptable and the
 * server decides what is common. This only tells the user whether they have
 * done better than the floor, which is what a strength meter is for.
 *
 * The floor it measures against is `PASSWORD_FLOOR` — ten at MVP, because every
 * self-registered account becomes an owner (Part 27 §27.4.2). A meter that
 * called a nine-character password "fair" while the form was about to reject it
 * would be worse than no meter.
 *
 * Deliberately four cheap signals rather than a dependency (ADR-021, R-D-3):
 * length at the floor, length well beyond it, a letter with a digit, and
 * anything that is neither.
 */
export const passwordStrength = (password: string): PasswordStrengthView => {
  const value = password ?? '';
  if (value.length === 0) {
    return { strength: 'weak', percent: 0, labelId: 'auth.password.strength.weak' };
  }
  const signals = [
    value.length >= PASSWORD_FLOOR,
    value.length >= PASSWORD_FLOOR + 4,
    /[A-Za-z]/.test(value) && /\d/.test(value),
    /[^A-Za-z0-9]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value)),
  ].filter(Boolean).length;

  const percent = (signals / 4) * 100;
  if (signals <= 1) return { strength: 'weak', percent, labelId: 'auth.password.strength.weak' };
  if (signals === 2 || signals === 3) {
    return { strength: 'fair', percent, labelId: 'auth.password.strength.fair' };
  }
  return { strength: 'strong', percent, labelId: 'auth.password.strength.strong' };
};

/**
 * PLT-01 §7 — the device label, derived from the user agent and capped at 120
 * chars. It survives CR-2026-09-19-A because `/auth/login` and `/auth/register`
 * both accept `device_label`, and PLT-09's device list is what it is for. It is a LABEL the user will later recognise in PLT-09's device list,
 * not a fingerprint: it is deliberately coarse, and it is the only thing the
 * client derives from `navigator` in this feature.
 */
export const deviceLabelFrom = (userAgent: string, fallback: string): string => {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const platform = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;

  if (!browser && !platform) return fallback.slice(0, 120);
  if (browser && platform) return `${browser} on ${platform}`.slice(0, 120);
  return (browser ?? platform ?? fallback).slice(0, 120);
};
