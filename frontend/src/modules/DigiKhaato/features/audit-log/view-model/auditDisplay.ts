import dayjs from 'dayjs';

import { formatBusinessDate, formatTimestamp } from 'src/utils/dates';

import type { AuditPeriod, AuditRow } from '../types/audit.types';

type T = (id: string, values?: Record<string, string | number | Date>) => string;

/**
 * QA D5 — the readable fallback for a code no locale has a label for yet:
 * separators become spaces and the first letter is upper-cased, so a new
 * server code never prints as a raw dotted id or a lowercase fragment.
 */
export const humanise = (code: string): string => {
  const words = code.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * PLT-08 §8 — an action code in the merchant's words.
 *
 * `audit.action.<code>` when the locale has it; otherwise the code made
 * readable WITHOUT its domain prefix ("auth.login_succeeded" → "Login
 * succeeded", not "Auth login succeeded" — QA D5), unless dropping it would
 * leave a single bare word. The fallback is what keeps a newly added server
 * action from printing a raw dotted id in the middle of the log — the
 * statement's `ledger.entry.type.manual_got` defect, which is why it is tested.
 */
export const actionLabel = (action: string, t: T): string => {
  const id = `audit.action.${action}`;
  const translated = t(id);
  if (translated !== id) return translated;
  const [domain, ...rest] = action.split('.');
  const tail = rest.join('.');
  return humanise(tail.includes('_') || rest.length > 1 ? tail : action || domain || '');
};

/** The entity's kind ("Party", "Business") — the same fallback rule as `actionLabel`. */
export const entityTypeLabel = (entityType: string, t: T): string => {
  const id = `audit.entity.${entityType}`;
  const translated = t(id);
  if (translated !== id) return translated;
  return humanise(
    entityType.replace(/^(platform|parties|ledger|sales|inventory|expenses|imports)_/, '')
  );
};

/**
 * QA D5 — a changed field's name ("bank_details.ifsc" → "Bank details › IFSC"
 * when the locale names it, "Bank details › Ifsc" when it does not). Each
 * dotted segment is looked up on its own under `audit.field.<segment>`, so
 * "address" is translated once and serves `address.city` too.
 */
export const fieldLabel = (key: string, t: T): string =>
  key
    .split('.')
    .map((segment) => {
      const id = `audit.field.${segment}`;
      const translated = t(id);
      return translated !== id ? translated : humanise(segment);
    })
    .join(' › ');

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

/** "2026-10-01 15:06:53.893825+00:00" or ISO "2026-10-01T15:06:53Z". */
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isEmptyContainer = (value: unknown): boolean =>
  (Array.isArray(value) && value.length === 0) ||
  (value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0);

/**
 * One value in a diff, short enough for a cell. `—` for nothing — and an empty
 * `{}` or `[]` IS nothing (QA D5: "address Before: {} · After: —"). A stored
 * timestamp reads dd/mm/yyyy, hh:mm in the merchant's zone and a stored date
 * dd/mm/yyyy, never "2026-10-01 15:06:53.893825+00:00".
 */
export const formatValue = (value: unknown, t: T): string => {
  if (value === null || value === undefined || value === '' || isEmptyContainer(value)) return '—';
  if (typeof value === 'boolean') return t(value ? 'audit.value.on' : 'audit.value.off');
  if (typeof value === 'string' && TIMESTAMP_RE.test(value)) {
    return formatTimestamp(value.replace(' ', 'T'));
  }
  if (typeof value === 'string' && DATE_RE.test(value)) return formatBusinessDate(value);
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL - 1)}…` : text;
};

export interface DiffLine {
  readonly key: string;
  /** The field's name in the merchant's words (QA D5). */
  readonly label: string;
  readonly before: string;
  readonly after: string;
}

const toLines = (
  keys: readonly string[],
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  t: T
): DiffLine[] =>
  keys
    .map((key) => ({
      key,
      label: fieldLabel(key, t),
      before: formatValue(before[key], t),
      after: formatValue(after[key], t),
    }))
    // Nothing on either side is not a change a merchant can read (QA D5).
    .filter((line) => !(line.before === '—' && line.after === '—'));

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
  const all = toLines(keys, before, after, t);
  return { lines: all.slice(0, max), more: Math.max(0, all.length - max) };
};

/** FR-2's drawer table — every key on either side that holds something. */
export const fullDiff = (row: AuditRow, t: T): readonly DiffLine[] => {
  const before = flatten(row.before ?? {});
  const after = flatten(row.after ?? {});
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  return toLines(keys, before, after, t);
};
