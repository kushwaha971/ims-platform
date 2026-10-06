'use client';

import { memo } from 'react';

import { X } from 'lucide-react';

import { cn } from 'src/utils/cn';

import { appliedLabel, isApplied, without } from './filterDisplay';

import type { UbFilterSpec, UbFilterValues } from './filterTypes';

/**
 * What is ON, once: a small pill per applied filter, each with ×, and "Clear
 * all" when there are two or more. Nothing renders when nothing is applied —
 * a row of unused options was exactly the space the owner asked to get back.
 */
export interface UbActiveFiltersProps {
  readonly specs: readonly UbFilterSpec[];
  readonly values: UbFilterValues;
  readonly onChange: (values: UbFilterValues) => void;
  readonly labels: {
    /** "Remove {filter}" — the × button's accessible name, already formatted. */
    readonly remove: (pill: string) => string;
    readonly clearAll: string;
  };
  readonly locale?: string;
  readonly className?: string;
}

function UbActiveFiltersBase({
  specs,
  values,
  onChange,
  labels,
  locale,
  className,
}: Readonly<UbActiveFiltersProps>) {
  const applied = specs.filter((spec) => isApplied(spec, values));
  if (applied.length === 0) return null;
  const clearAll = () =>
    onChange(applied.reduce<UbFilterValues>((acc, spec) => without(spec, acc), values));
  return (
    <ul className={cn('flex flex-wrap items-center gap-2', className)} data-testid="active-filters">
      {applied.map((spec) => {
        const text = appliedLabel(spec, values, locale);
        return (
          <li
            key={spec.key}
            className="ds-body-s-regular inline-flex h-7 max-w-full items-center gap-1 rounded-pill bg-accent-quiet pl-3 pr-1 text-text-accent"
          >
            <span className="truncate">{text}</span>
            <button
              type="button"
              aria-label={labels.remove(text)}
              onClick={() => onChange(without(spec, values))}
              className="ub-hit inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill outline-none hover:bg-surface-hover focus-visible:shadow-focus"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          </li>
        );
      })}
      {applied.length > 1 && (
        <li>
          <button
            type="button"
            onClick={clearAll}
            className="ub-hit ds-body-s-regular rounded-control px-2 text-text-accent underline-offset-2 outline-none hover:underline focus-visible:shadow-focus"
          >
            {labels.clearAll}
          </button>
        </li>
      )}
    </ul>
  );
}

UbActiveFiltersBase.displayName = 'UbActiveFilters';
export const UbActiveFilters = memo(UbActiveFiltersBase);
