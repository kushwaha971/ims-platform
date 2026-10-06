/** "6 Oct 2026" — `UbDateInput`'s face, copied so a button does not import a calendar. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_HI = [
  'जन॰',
  'फ़र॰',
  'मार्च',
  'अप्रैल',
  'मई',
  'जून',
  'जुल॰',
  'अग॰',
  'सित॰',
  'अक्तू॰',
  'नव॰',
  'दिस॰',
];
export const formatDateFace = (iso: string, locale?: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const months = locale?.startsWith('hi') ? MONTHS_HI : MONTHS;
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
};

import type { UbFilterSpec, UbFilterValues } from './filterTypes';

/** The keys a spec writes. */
export const specKeys = (spec: UbFilterSpec): readonly string[] =>
  spec.kind === 'dateRange' ? [spec.fromKey, spec.toKey] : [spec.key];

export const isApplied = (spec: UbFilterSpec, values: UbFilterValues): boolean =>
  specKeys(spec).some((key) => (values[key] ?? '') !== '');

/** How many filters are on — the badge on the Filters button. */
export const appliedCount = (specs: readonly UbFilterSpec[], values: UbFilterValues): number =>
  specs.filter((spec) => isApplied(spec, values)).length;

/** What a pill says about an applied filter: "Status: Unpaid", "Date: 1 Oct – 6 Oct". */
export const appliedLabel = (
  spec: UbFilterSpec,
  values: UbFilterValues,
  locale?: string
): string => {
  if (spec.kind === 'dateRange') {
    const from = values[spec.fromKey] ?? '';
    const to = values[spec.toKey] ?? '';
    const face = (iso: string) => formatDateFace(iso, locale);
    const range =
      from && to ? `${face(from)} – ${face(to)}` : from ? `≥ ${face(from)}` : `≤ ${face(to)}`;
    return `${spec.label}: ${range}`;
  }
  const raw = values[spec.key] ?? '';
  const chosen = spec.kind === 'multi' ? raw.split(',').filter(Boolean) : [raw];
  const names = chosen.map(
    (value) => spec.options.find((option) => option.value === value)?.label ?? value
  );
  return `${spec.label}: ${names.join(', ')}`;
};

/** The values with one spec cleared. */
export const without = (spec: UbFilterSpec, values: UbFilterValues): UbFilterValues => {
  const next = { ...values };
  specKeys(spec).forEach((key) => {
    next[key] = '';
  });
  return next;
};
