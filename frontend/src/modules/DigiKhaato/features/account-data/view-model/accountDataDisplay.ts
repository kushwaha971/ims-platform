import type { UbStatusBadgeTone } from 'src/design-system';

import type { ExportStatus, SupportAccessStatus, TenantExport } from '../types/accountData.types';

/** PLT-10 / PLT-14 — how the "Your data" page reads. Pure; message ids for `t()`. */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The cool-off countdown in whole days, rounded UP: "1 day left" until the last minute. */
export const daysLeft = (ms: number): number => (ms <= 0 ? 0 : Math.ceil(ms / DAY_MS));

/** FRD §9 — the badge on each export row. */
export const exportBadge = (
  status: ExportStatus
): { readonly labelId: string; readonly tone: UbStatusBadgeTone } => {
  switch (status) {
    case 'succeeded':
      return { labelId: 'data.export.status.succeeded', tone: 'success' };
    case 'failed':
      return { labelId: 'data.export.status.failed', tone: 'error' };
    case 'expired':
      return { labelId: 'data.export.status.expired', tone: 'neutral' };
    case 'running':
      return { labelId: 'data.export.status.running', tone: 'info' };
    default:
      return { labelId: 'data.export.status.queued', tone: 'info' };
  }
};

export const supportBadge = (
  status: SupportAccessStatus
): { readonly labelId: string; readonly tone: UbStatusBadgeTone } => {
  switch (status) {
    case 'requested':
      return { labelId: 'data.support.status.requested', tone: 'warning' };
    case 'granted':
      return { labelId: 'data.support.status.granted', tone: 'success' };
    case 'denied':
      return { labelId: 'data.support.status.denied', tone: 'neutral' };
    case 'revoked':
      return { labelId: 'data.support.status.revoked', tone: 'neutral' };
    default:
      return { labelId: 'data.support.status.expired', tone: 'neutral' };
  }
};

/** An export still being built — the page polls these and nothing else. */
export const isInFlight = (row: TenantExport): boolean =>
  row.status === 'queued' || row.status === 'running';

/** `1536` → `1.5 KB`. Binary units, one decimal, because that is what a file manager shows. */
export const formatBytes = (bytes: number | null): string => {
  if (bytes === null || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
};

/** Total rows across every CSV in the bundle. */
export const totalRows = (counts: Readonly<Record<string, number>>): number =>
  Object.values(counts).reduce((sum, n) => sum + n, 0);

/** FRD §10 — the typed name must equal the business name, case-insensitive and trimmed. */
export const nameMatches = (typed: string, businessName: string): boolean =>
  typed.trim().toLocaleLowerCase() === businessName.trim().toLocaleLowerCase();
