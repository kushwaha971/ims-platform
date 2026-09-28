'use client';

import { type ReactNode } from 'react';

import { IntlProvider } from 'react-intl';

import { useAppSelector } from 'src/hooks/useAppStore';
import { useMessages } from 'src/hooks/useMessages';
import { formattingLocale } from 'src/i18n/formattingLocale';
import { selectLocale } from 'src/redux/slice/localeSlice';

/**
 * A missing key is a bug, not a crash: log in dev, render the key in prod.
 *
 * Module scope rather than an inline arrow: `IntlProvider` rebuilds its `intl`
 * object — re-rendering every `useIntl` consumer — whenever a config prop
 * changes identity, and an inline function changes on every render. That
 * mattered little while this provider re-rendered only on a locale change; it
 * now also re-renders when a screen's message catalogue registers (W4-P).
 */
const onIntlError = (error: { readonly message: string }): void => {
  if (process.env.NODE_ENV !== 'production') console.warn('[intl]', error.message);
};

/** Part 19 §19.11.1 — `react-intl` with ICU messages (ADR-006). */
export function IntlProviderShell({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const locale = useAppSelector(selectLocale);
  // The shell's English is bundled; each screen's words arrive with its chunk
  // and every Hindi half on demand (src/i18n/catalogueRegistry.ts).
  const messages = useMessages(locale);

  return (
    <IntlProvider
      locale={formattingLocale(locale)}
      defaultLocale="en-IN"
      messages={messages}
      onError={onIntlError}
    >
      {children}
    </IntlProvider>
  );
}
