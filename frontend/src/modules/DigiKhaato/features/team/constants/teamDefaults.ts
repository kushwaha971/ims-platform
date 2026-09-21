import type { TenantRole } from 'src/types/domain.types';

/** Part 22 §22.1 caps `page_size` at 100; 25 is the documented default. */
export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS: readonly number[] = [25, 50, 100];

/**
 * The roles this screen may hand out, and the one it may not.
 *
 * `owner` is absent deliberately. A business has exactly one owner — it is the
 * rule `last_owner` exists to defend — so ownership is TRANSFERRED, never
 * invited: sending a second owner an email would create the state that refusal
 * is there to prevent, and there is no transfer flow at MVP. The server is the
 * authority and will refuse it; this list is what stops the screen offering a
 * choice that can only end in an error.
 */
export const INVITABLE_ROLES: readonly TenantRole[] = ['admin', 'staff', 'accountant'];

/** The default selection: the least privilege that is still useful. */
export const DEFAULT_INVITE_ROLE: TenantRole = 'staff';
