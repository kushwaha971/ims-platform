import type { Locale, ModuleCode, PermissionCode } from 'src/types/domain.types';

/**
 * Part 19 §19.2.3 — the auth feature's own types.
 *
 * Nothing here holds a token. `ub_access` and `ub_refresh` are httpOnly cookies
 * the browser attaches and JavaScript cannot read (§19.7.1), so the only
 * server-issued artefact that reaches this layer is the session SUMMARY.
 *
 * **CR-2026-09-19-A — email + password is the whole of MVP authentication.**
 * Mobile OTP, and with it every shape that described a challenge — `OtpPurpose`,
 * `OtpChallenge`, `OtpRequestInput`, `OtpVerifyInput`, `LoginMethod` — is
 * backlogged with the SMS provider it needs. The product runs locally for its
 * owner first, and an identity that cannot be proved without a third party is
 * not an identity that product can use.
 *
 * Mobile did NOT leave the product: it is a profile field here, and parties,
 * invoices and the later WhatsApp reminders all still carry one. It simply is
 * not what you log in with, which is why `mobile` below is nullable and `email`
 * is not.
 */

/** PLT-04 FR-1 — a membership row as `/auth/me` returns it. */
export const MEMBERSHIP_STATUSES = ['active', 'invited', 'suspended', 'removed'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const ROLE_CODES = ['owner', 'admin', 'staff', 'accountant'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

// ── Wire shapes (snake_case, exactly as Part 22 §22.2 documents them) ────────

export interface TenantApiRow {
  readonly id: string;
  readonly name: string;
  readonly timezone?: string;
  readonly role?: RoleCode;
  readonly is_default?: boolean;
  readonly status?: MembershipStatus;
  /** PLT-04 FR-5 / FR-7 — the caller's own membership row, for default/leave. */
  readonly membership_id?: string;
  /** PLT-03 FR-9 — `< 4` means the wizard is unfinished. */
  readonly onboarding_step?: number;
}

// ── Domain shapes ────────────────────────────────────────────────────────────

/** PLT-02 FR-1 — the login body. One identity, and it is an email. */
export interface PasswordLoginInput {
  readonly email: string;
  readonly password: string;
  /** PLT-01 §7 — a label the user will recognise in PLT-09's device list. */
  readonly deviceLabel?: string;
}

/**
 * CR-2026-09-19-A FR-S1 — sign-up. There is no longer an OTP verify that
 * registers a user as a side effect, so registration is an explicit act with an
 * explicit screen.
 */
export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  /** PLT-03 BR-7 — optional; step 1 of the wizard asks again if it is blank. */
  readonly name?: string;
  /**
   * E.164, and OPTIONAL — this is the whole point of CR-2026-09-19-A. A number
   * given here is a profile field the later WhatsApp reminders and PLT-03's
   * default business phone use; it proves nothing and logs nobody in.
   */
  readonly mobile?: string;
  readonly deviceLabel?: string;
}

export interface PasswordSetInput {
  readonly newPassword: string;
  /** Absent when the account is setting a password for the first time. */
  readonly currentPassword?: string;
  /** PLT-02 FR-9 — only a deliberate tick revokes the user's other devices. */
  readonly logoutOtherDevices?: boolean;
}

/**
 * PLT-02 FR-5 — the reset token arrives in the link the server creates. At MVP
 * that link is written to the server log by the console mail backend, which is
 * exactly why the screen never claims an email was delivered.
 */
export interface PasswordResetConfirmInput {
  readonly token: string;
  readonly newPassword: string;
}

/**
 * PLT-01 FR-5 — the login / register body. It is the `/auth/me` shape plus the
 * one field only a fresh authentication knows: whether this account is new.
 */
export interface AuthResult {
  readonly userId: string;
  readonly name: string;
  /** The identity. Never null: an account without one cannot be logged into. */
  readonly email: string;
  /** A profile field now, not a credential — and therefore optional. */
  readonly mobile: string | null;
  readonly locale: Locale;
  /** FR-5 — a new account has no tenants and routes to PLT-03. */
  readonly isNew: boolean;
  /** PLT-02 FR-3 — whether the account already has a password. */
  readonly hasPassword: boolean;
  readonly activeTenantId: string | null;
  readonly tenants: readonly AuthTenant[];
  readonly permissions: readonly PermissionCode[];
  readonly enabledModules: readonly ModuleCode[];
}

export interface AuthTenant {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
  readonly role: RoleCode | null;
  readonly isDefault: boolean;
  readonly status: MembershipStatus;
  readonly membershipId: string | null;
  readonly onboardingStep: number | null;
}

/**
 * PLT-01 FR-9 / PLT-04 FR-9 — where an authenticated user goes next. A pure
 * decision, computed by the view-model and executed by the hook, so the routing
 * rule is unit-testable without a router.
 */
export type PostAuthDestination =
  | { readonly kind: 'onboarding'; readonly step: number }
  | { readonly kind: 'setPassword' }
  | { readonly kind: 'chooser' }
  | { readonly kind: 'invitation' }
  | { readonly kind: 'app'; readonly tenantId: string };
