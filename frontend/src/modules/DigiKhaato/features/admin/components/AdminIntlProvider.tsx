'use client';

import { useMemo, type ReactNode } from 'react';

import { IntlProvider, useIntl } from 'react-intl';

import { ADMIN_MESSAGES } from '../i18n/adminMessages';

/**
 * PLT-14 — lays the console's own words over the shell catalogue, for the
 * `(admin)` routes only. Same locale and error handling as the shell's
 * provider; `t('admin.…')` resolves here and nowhere else, which is what keeps
 * ~120 console strings off every merchant route (see `adminMessages.ts`).
 */
export function AdminIntlProvider({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const intl = useIntl();
  // The shell's catalogue is plain ICU strings (`useMessages`), never pre-parsed ASTs.
  const messages = useMemo<Record<string, string>>(
    () => ({ ...(intl.messages as Record<string, string>), ...ADMIN_MESSAGES }),
    [intl.messages]
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
