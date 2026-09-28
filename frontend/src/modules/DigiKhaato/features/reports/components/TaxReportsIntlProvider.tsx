'use client';

import { useMemo, type ReactNode } from 'react';

import { IntlProvider, useIntl } from 'react-intl';

import { useAppSelector } from 'src/hooks/useAppStore';
import { selectLocale } from 'src/redux/slice/localeSlice';

import { TAX_REPORT_MESSAGES } from '../i18n/taxReportMessages';

/**
 * Lays the three tax reports' own words (both languages) over the shell
 * catalogue, for their routes only — the "Your data" page's mechanism
 * (`AccountDataIntlProvider`), because every key in `locales/*.json` ships to
 * every route and the shell is already over its budget.
 */
export function TaxReportsIntlProvider({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const intl = useIntl();
  const locale = useAppSelector(selectLocale);
  const messages = useMemo<Record<string, string>>(
    () => ({ ...(intl.messages as Record<string, string>), ...TAX_REPORT_MESSAGES[locale] }),
    [intl.messages, locale]
  );
  return (
    <IntlProvider
      locale={intl.locale}
      defaultLocale={intl.defaultLocale}
      messages={messages}
      onError={intl.onError}
    >
      {children}
    </IntlProvider>
  );
}
