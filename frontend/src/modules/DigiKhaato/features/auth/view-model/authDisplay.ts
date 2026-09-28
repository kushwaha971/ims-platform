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
 *     (PLT-03 FR-9) — but only for the OWNER, who is the only role that can
 *     complete it. See the branch itself for the dead end this avoids.
 *  4. Exactly one active tenant, or a default among several, opens it.
 *  5. Several with no default opens the full-screen chooser.
 */
export const postAuthDestination = (result: AuthResult): PostAuthDestination => {
  if (result.mustChangePassword) return { kind: 'setPassword' };

  const active = result.tenants.filter((tenant) => tenant.status === 'active');
  const invited = result.tenants.filter((tenant) => tenant.status === 'invited');

  if (active.length === 0) {
    if (invited.length > 0) return { kind: 'invitation' };
    return { kind: 'onboarding', step: 1 };
  }

  const chosen = resolveActiveTenant(result.activeTenantId, active);
  if (!chosen) return { kind: 'chooser' };

  /**
   * Rule 3, and the role test is not a refinement — it is what stops a dead end.
   *
   * The wizard writes through `PATCH /tenants/current`, which requires
   * `platform.tenant.manage`, and canon §0.9 gives that to the OWNER alone —
   * not even to an admin. So routing anybody else into an unfinished wizard
   * sends them to a screen where every step answers 403, on every sign-in,
   * with no way out: the router puts them back each time they navigate away.
   *
   * It was unreachable until DEC-012, because there was no working way for a
   * second person to join a business. Measured against the live server the day
   * that changed: a staff member added to a tenant with `onboarding_step: 1`
   * landed on `/onboarding/step/2`, and `PATCH /tenants/current` answered
   * `403 permission_denied`.
   *
   * An owner who has not finished setting the business up is not a reason to
   * stop their salesman working, so the staff member goes to the app. The
   * business is usable; it is the owner's own configuration that is pending,
   * and the owner is the one who will be asked to finish it.
   */
  const canRunTheWizard = chosen.role === 'owner';
  if (canRunTheWizard && chosen.onboardingStep !== null && chosen.onboardingStep < 4) {
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
 *
 * F-2 (QA, 23 Sep 2026) — the first version refused `//`, `/\` and `://` by
 * prefix and was bypassed live: `/login?next=/%09/evil.test/x` signed in and
 * landed on evil.test. `searchParams.get` decodes `%09` to a TAB, the prefix
 * test sees `/` + tab and passes it, and the browser's URL parser then DELETES
 * every tab, LF and CR before parsing — so the string navigated to was
 * `//evil.test/x`, a protocol-relative URL to another host. A deny-list of
 * spellings cannot win against a parser that rewrites the input first, so this
 * now asks the parser itself:
 *
 *  1. refuse any C0 control character, DEL or backslash ANYWHERE — no real
 *     in-app address carries one, and each is something a browser strips or
 *     reinterprets as `/`;
 *  2. require one leading `/` not followed by another `/` or `\`;
 *  3. resolve against a sentinel origin with `new URL` and require the result
 *     to still be on that origin, returning only path + query + hash, so what
 *     is navigated to is what the parser produced rather than what was typed;
 *  4. re-apply rules 1 and 2 to the RESOLVED path, percent-decoded once. Dot
 *     segments are where this bites: `/.//evil.com` and `/a/../..//evil.com`
 *     pass rules 1-3 and resolve to the pathname `//evil.com`, which handed to
 *     the router is protocol-relative again. Decoding once also refuses
 *     `/%2F/evil.com` and `%5C`: nothing here decodes them today, and this is
 *     so a single stray decode downstream cannot turn them into `//`.
 *
 * A space is allowed: the parser percent-encodes it inside a path, so
 * `/ /evil.com` becomes the same-origin `/%20/evil.com`, a 404 on our own host.
 * The sentinel origin is fixed rather than `window.location.origin` because the
 * question is only "did resolution leave the origin it started from", which
 * does not depend on which origin that is — and this stays callable on the
 * server, where there is no window.
 */
const UNSAFE_REDIRECT_CHARS = /[\u0000-\u001F\u007F\\]/;
const SINGLE_LEADING_SLASH = /^\/(?![/\\])/;
const REDIRECT_SENTINEL_ORIGIN = 'http://next-path.invalid';

const decodeOnce = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

export const safeNextPath = (next: string | null | undefined, fallback: string): string => {
  if (!next) return fallback;
  if (UNSAFE_REDIRECT_CHARS.test(next) || !SINGLE_LEADING_SLASH.test(next)) return fallback;

  let resolved: URL;
  try {
    resolved = new URL(next, REDIRECT_SENTINEL_ORIGIN);
  } catch {
    return fallback;
  }
  if (resolved.origin !== REDIRECT_SENTINEL_ORIGIN) return fallback;

  const decodedPath = decodeOnce(resolved.pathname);
  if (
    decodedPath === null ||
    UNSAFE_REDIRECT_CHARS.test(decodedPath) ||
    !SINGLE_LEADING_SLASH.test(decodedPath)
  ) {
    return fallback;
  }
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
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
