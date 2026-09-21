import type { Locale } from 'src/types/domain.types';

/**
 * The locale that FORMATS a date or an amount, which is not the locale the
 * messages are keyed on.
 *
 * `useTranslation`'s `d()` documents itself as "dd/mm/yyyy in both locales" and
 * `n()` as "en-IN grouping for en/hi". Neither was true for English, because
 * `IntlProvider` was handed the bare tag `en`, and `Intl` resolves that as
 * en-US:
 *
 *   locale   date          number
 *   en       09/28/2026    1,234,567
 *   en-IN    28/09/2026    12,34,567
 *
 * So an English-speaking merchant in India read every date month-first and
 * every amount grouped in thousands. `12,34,567` is how a shopkeeper reads
 * money; `1,234,567` is a number they have to stop and count, in a product
 * whose whole job is reading a balance at a glance.
 *
 * `hi` already resolved to Indian formats by accident of CLDR, so only English
 * changes.
 *
 * It lives in its own module because BOTH the app shell and
 * `renderWithProviders` must use it. The test harness builds its own
 * `IntlProvider`, so it carried the same defect independently — which is why
 * every assertion in the suite was written against en-US output and none of
 * them failed. A shared constant is what stops the harness and the product
 * disagreeing about what a date looks like.
 */
export const FORMATTING_LOCALE: Readonly<Record<Locale, string>> = {
  en: 'en-IN',
  hi: 'hi-IN',
};

export const formattingLocale = (locale: string): string =>
  FORMATTING_LOCALE[locale as Locale] ?? locale;
