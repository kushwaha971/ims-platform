'use client';

import { useMemo, type ReactNode } from 'react';

import { IntlProvider, useIntl } from 'react-intl';

import { useAppSelector } from 'src/hooks/useAppStore';
import { selectLocale } from 'src/redux/slice/localeSlice';

import { DATA_MESSAGES } from '../i18n/dataMessages';

/**
 * PLT-10 — lays the "Your data" page's own words (both languages) over the
 * shell catalogue, for `/settings/data` only. Same locale and error handling as
 * the shell's provider; see `dataMessages.ts` for why these strings are not in
 * `locales/*.json`.
 */
export function AccountDataIntlProvider({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const intl = useIntl();
  const locale = useAppSelector(selectLocale);
  // The shell's catalogue is plain ICU strings (`useMessages`), never pre-parsed ASTs.
  const messages = useMemo<Record<string, string>>(
    () => ({ ...(intl.messages as Record<string, string>), ...DATA_MESSAGES[locale] }),
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
