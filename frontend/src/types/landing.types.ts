/**
 * docs/platform/14 §4.1 — where a session goes next, as the SERVER decided it.
 *
 * Every session body (`/auth/login`, register, reset confirm, password change,
 * switch-tenant, refresh and `/auth/me`) carries `landing`, computed by
 * `platform_app/selectors/landing.py` from the server's own state. The client
 * never re-derives it: five client copies of this rule used to disagree, and one
 * of them sent every person who set a password into the onboarding wizard.
 */
export type Landing =
  | { readonly kind: 'set_password' }
  | { readonly kind: 'choose_business' }
  | { readonly kind: 'invitation' }
  | { readonly kind: 'admin' }
  | { readonly kind: 'no_business' }
  | { readonly kind: 'business_setup'; readonly tenantId: string; readonly step: number }
  | {
      readonly kind: 'app';
      readonly tenantId: string;
      /** docs/platform/14 §4.2 — the app the person is in, and its home. */
      readonly app?: string;
      readonly path?: string;
    };

export type LandingKind = Landing['kind'];

type Wire = Readonly<Record<string, unknown>>;

/** The wire's `landing`, or `null` when the body has none (a test fixture). */
export const toLanding = (raw: unknown): Landing | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Wire;
  const tenantId = typeof row.tenant_id === 'string' ? row.tenant_id : '';
  switch (row.kind) {
    case 'set_password':
    case 'choose_business':
    case 'invitation':
    case 'admin':
    case 'no_business':
      return { kind: row.kind };
    case 'business_setup':
      return { kind: 'business_setup', tenantId, step: Number(row.step) || 1 };
    case 'app':
      return {
        kind: 'app',
        tenantId,
        ...(typeof row.app === 'string' ? { app: row.app } : {}),
        ...(typeof row.path === 'string' && row.path.startsWith('/') ? { path: row.path } : {}),
      };
    default:
      return null;
  }
};

/**
 * A body WITHOUT `landing` — a test fixture, or a server older than this client
 * — read in the server's precedence from its bare facts. It cannot make the one
 * judgement only the server can (an owner's own unfinished setup), so it never
 * answers `business_setup`. Every live server body carries `landing`.
 */
export const landingFromFacts = (facts: {
  readonly mustChangePassword: boolean;
  readonly activeTenantId: string | null;
  readonly tenantStatuses: readonly (string | undefined)[];
  readonly isSuperAdmin: boolean;
}): Landing => {
  if (facts.mustChangePassword) return { kind: 'set_password' };
  if (facts.activeTenantId) return { kind: 'app', tenantId: facts.activeTenantId };
  if (facts.tenantStatuses.includes('active')) return { kind: 'choose_business' };
  if (facts.tenantStatuses.includes('invited')) return { kind: 'invitation' };
  if (facts.isSuperAdmin) return { kind: 'admin' };
  return { kind: 'no_business' };
};
