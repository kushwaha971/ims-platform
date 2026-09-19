'use client';

import { type ReactNode } from 'react';

import { IntlProvider } from 'react-intl';

import { useAppSelector } from 'src/hooks/useAppStore';
import { useMessages } from 'src/hooks/useMessages';
import { selectLocale } from 'src/redux/slice/localeSlice';

/** Part 19 §19.11.1 — `react-intl` with ICU messages (ADR-006). */
export function IntlProviderShell({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const locale = useAppSelector(selectLocale);
  const messages = useMessages(locale); // en bundled; hi fetched on demand

  return (
    <IntlProvider
      locale={locale}
      defaultLocale="en"
      messages={messages}
      // A missing key is a bug, not a crash: log in dev, render the key in prod.
      onError={(error) => {
        if (process.env.NODE_ENV !== 'production') console.warn('[intl]', error.message);
      }}
    >
      {children}
    </IntlProvider>
  );
}
