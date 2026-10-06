import { formatDateFace } from '../UbDateInput/UbDateInput';

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
