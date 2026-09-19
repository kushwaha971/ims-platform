import type { SessionTenant } from 'src/redux/slice/sessionSlice';
import { truncateText, type TruncatedText } from 'src/utils/text';

/**
 * Part 19 §19.1.1 layer 3 — pure. The switcher's grouping and its row state,
 * decided without React so the rules are unit-testable.
 */

export interface TenantGroups {
  /** FR-1 — "Your businesses": every `active` membership. */
  readonly active: readonly SessionTenant[];
  /** FR-1 — "Invitations": `invited` rows, which OPEN rather than switch (FR-8). */
  readonly invited: readonly SessionTenant[];
  /** EC-6 — a suspended tenant is listed, greyed, with its reason. */
  readonly suspended: readonly SessionTenant[];
}

export const groupTenants = (tenants: readonly SessionTenant[]): TenantGroups => ({
  active: tenants.filter((tenant) => (tenant.status ?? 'active') === 'active'),
  invited: tenants.filter((tenant) => tenant.status === 'invited'),
  suspended: tenants.filter((tenant) => tenant.status === 'suspended'),
});

/**
 * §5 / EC-5 — "chooser renders ≤ 50 tenants without pagination (≥ 50 → search
 * field appears)", and the MENU shows at most eight plus "See all". A CA with
 * sixty clients is the case these two numbers exist for.
 */
export const MENU_TENANT_LIMIT = 8;
export const CHOOSER_SEARCH_THRESHOLD = 8;

export const needsChooserSearch = (count: number): boolean => count > CHOOSER_SEARCH_THRESHOLD;

/** A plain substring match over the name — the chooser has nothing else to match. */
export const filterTenants = (
  tenants: readonly SessionTenant[],
  query: string
): readonly SessionTenant[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return tenants;
  return tenants.filter((tenant) => tenant.name.toLowerCase().includes(needle));
};

/**
 * §7 — the desktop rail truncates names at 22 characters with a tooltip. The
 * truncation is a pure decision so the tooltip and the visible text cannot
 * disagree about whether one was applied.
 */
export const TENANT_NAME_MAX = 22;

export type TenantNameView = TruncatedText;

/**
 * The truncation itself is `truncateText` in `src/utils/text.ts`; this names the
 * default width the rail uses. The avatar's initials moved to the same file and
 * are applied by `UbAvatar` — they were duplicated here and in
 * `parties/view-model/partyDisplay.ts`, byte for byte.
 */
export const tenantNameView = (name: string, max: number = TENANT_NAME_MAX): TenantNameView =>
  truncateText(name, max);

/**
 * FR-7 / §12 — "Leave business" is offered to a member on their OWN membership,
 * and an owner may not leave while they are the last owner. The client cannot
 * know how many owners there are, so it offers the action and lets the server
 * refuse with 409 `last_owner` — which the dialog then explains. Hiding it on a
 * guess would hide it from owners who are not the last one.
 */
export const canLeave = (tenant: SessionTenant): boolean =>
  Boolean(tenant.membershipId) && (tenant.status ?? 'active') === 'active';

/** FR-5 — the default can only be set on an active membership that is not it. */
export const canSetDefault = (tenant: SessionTenant): boolean =>
  Boolean(tenant.membershipId) && (tenant.status ?? 'active') === 'active' && !tenant.isDefault;
