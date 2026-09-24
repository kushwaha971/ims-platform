import type { AppNotification } from '../types/notification.types';

/**
 * NTF-01 — how a row and the badge read. Pure; message ids for the caller's `t()`.
 */

/** §7 — "1–9, then 9+"; nothing at zero, and nothing before the first count (§9). */
export const badgeText = (count: number | null): string | null => {
  if (count === null || count <= 0) return null;
  return count > 9 ? '9+' : String(count);
};

/** The types this client has words for. Anything else falls back to the server's English. */
export const KNOWN_TYPES: ReadonlySet<string> = new Set([
  'reminder_due',
  'reminder_failed',
  'low_stock',
  // IMP-01 §17 / IMP-02 FR-14 — to the member who uploaded or exported.
  'import_done',
  'import_failed',
  'export_ready',
  'export_failed',
  // PLT-10 / PLT-14 — the owner-facing platform events.
  'data_export_ready',
  'deletion_requested',
  'deletion_cancelled',
  'support_access_request',
  'support_session_started',
]);

/**
 * BR-10 — a Hindi member reads Hindi: the title is rendered here from the type
 * and its params, not taken from the English string written at raise time.
 */
export const titleView = (
  row: AppNotification
): {
  readonly id: string | null;
  readonly values: Readonly<Record<string, string | number>>;
  readonly fallback: string;
} => {
  if (!KNOWN_TYPES.has(row.type)) return { id: null, values: {}, fallback: row.title };
  return {
    id: `notifications.type.${row.type}.title`,
    values: { ...row.params, count: row.count },
    fallback: row.title,
  };
};

export const bodyId = (row: AppNotification): string | null =>
  KNOWN_TYPES.has(row.type) ? `notifications.type.${row.type}.body` : null;

/** §19 — only an in-app path is followed, whatever the payload says. */
export const safeRoute = (route: string): string =>
  route.startsWith('/') && !route.startsWith('//') ? route : '/';
