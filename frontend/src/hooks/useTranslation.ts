'use client';

import { useMemo } from 'react';

import { useIntl } from 'react-intl';

/**
 * `t`, as a name rather than as a signature copied into every caller.
 *
 * It was written out longhand in `PartyListColumns` and again in
 * `PartyListFilters`, and a third copy is where the copies start disagreeing —
 * the values record in particular, which quietly decides whether a component
 * can pass a number to an ICU plural.
 */
export type TranslateFn = (
  id: string,
  values?: Record<string, string | number | Date>
) => string;

export interface UseTranslationResult {
  readonly t: TranslateFn;
  readonly n: (value: number, options?: Intl.NumberFormatOptions) => string;
  readonly d: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  readonly locale: string;
}

/**
 * Part 19 §19.11.1 — the wrapper every component uses; BrandHub's pattern kept
 * verbatim in shape. No component calls `useIntl()` directly, so the day the
 * i18n library changes there is one file to edit.
 */
export const useTranslation = (): UseTranslationResult => {
  const intl = useIntl();
  return useMemo(
    () => ({
      t: (id: string, values?: Record<string, string | number | Date>) =>
        id ? intl.formatMessage({ id, defaultMessage: id }, values) : '',
      /** Number in the active locale with en-IN grouping for en/hi. */
      n: (value: number, options?: Intl.NumberFormatOptions) => intl.formatNumber(value, options),
      /** Business date (dd/mm/yyyy in both locales). */
      d: (value: string | Date, options?: Intl.DateTimeFormatOptions) =>
        intl.formatDate(value, options ?? { day: '2-digit', month: '2-digit', year: 'numeric' }),
      locale: intl.locale,
    }),
    [intl]
  );
};
