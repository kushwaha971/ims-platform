import dayjs from 'dayjs';

import type { AuditPeriod, AuditRow } from '../types/audit.types';

type T = (id: string, values?: Record<string, string | number | Date>) => string;

/**
 * PLT-08 §8 — an action code in the merchant's words.
 *
 * `audit.action.<code>` when the locale has it; otherwise the code itself made
 * readable ("member.role_changed" → "Member role changed"). The fallback is
 * what keeps a newly added server action from printing a raw dotted id in the
 * middle of the log — the statement's `ledger.entry.type.manual_got` defect,
 * which is why it is tested.
 */
export const actionLabel = (action: string, t: T): string => {
  const id = `audit.action.${action}`;
  const translated = t(id);
  if (translated !== id) return translated;
  const words = action.replace(/[._]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The entity's kind ("Party", "Business") — the same fallback rule as `actionLabel`. */
export const entityTypeLabel = (entityType: string, t: T): string => {
  const id = `audit.entity.${entityType}`;
  const translated = t(id);
  if (translated !== id) return translated;
  const words = entityType.replace(/^(platform|parties|ledger)_/, '').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** §8: the system actor reads "System (scheduled job)", never a blank "Who". */
export const actorLabel = (row: AuditRow, t: T): string => {
  if (row.actor?.name) return row.actor.name;
  if (row.actorType === 'system') return t('audit.actor.system');
  if (row.actorType === 'super_admin') return t('audit.actor.support');
  return t('audit.actor.unknown');
};

/** FR-3 — the period chips, resolved to inclusive dates by THIS view-model. */
export const periodRange = (
  period: Exclude<AuditPeriod, 'custom'>,
  today: string
): { readonly from: string; readonly to: string } => {
  const end = dayjs(today);
  const days = period === 'today' ? 0 : period === 'last7' ? 6 : 29;
  return { from: end.subtract(days, 'day').format('YYYY-MM-DD'), to: end.format('YYYY-MM-DD') };
};

/** EC-5 — nested jsonb as dotted paths, matching the server's `changed_keys`. */
export const flatten = (value: unknown, prefix = ''): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return prefix ? { [prefix]: {} } : {};
    return entries.reduce<Record<string, unknown>>(
      (acc, [key, inner]) => ({ ...acc, ...flatten(inner, prefix ? `${prefix}.${key}` : key) }),
      {}
    );
  }
  return prefix ? { [prefix]: value } : {};
};

const MAX_CELL = 60;

/** One value in a diff, short enough for a cell. `—` for nothing. */
export const formatValue = (value: unknown, t: T): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return t(value ? 'audit.value.on' : 'audit.value.off');
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL - 1)}…` : text;
};

export interface DiffLine {
  readonly key: string;
  readonly before: string;
  readonly after: string;
}

/**
 * FR-2 / T-PLT-08-6 — up to `max` "field: before → after" lines and how many
 * more there are. Rows with no before (a creation) show only the after side.
 */
export const diffLines = (
  row: AuditRow,
  t: T,
  max = 3
): { readonly lines: readonly DiffLine[]; readonly more: number } => {
  const before = flatten(row.before ?? {});
  const after = flatten(row.after ?? {});
  const keys = row.changedKeys.length ? row.changedKeys : Object.keys(after);
  const lines = keys.slice(0, max).map((key) => ({
    key,
    before: formatValue(before[key], t),
    after: formatValue(after[key], t),
  }));
  return { lines, more: Math.max(0, keys.length - max) };
};

/** FR-2's drawer table — every key on either side, so nothing is hidden. */
export const fullDiff = (row: AuditRow, t: T): readonly DiffLine[] => {
  const before = flatten(row.before ?? {});
  const after = flatten(row.after ?? {});
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  return keys.map((key) => ({
    key,
    before: formatValue(before[key], t),
    after: formatValue(after[key], t),
  }));
};
