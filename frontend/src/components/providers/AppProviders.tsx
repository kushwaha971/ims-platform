'use client';

import { type ReactNode } from 'react';

import { Provider } from 'react-redux';

import { IntlProviderShell } from 'src/components/providers/IntlProviderShell';
import { ThemeProvider } from 'src/components/providers/ThemeProvider';
import { store } from 'src/redux/store';

/**
 * Part 19 §19.7.2 / §19.11.1 — the provider stack `app/layout.tsx` renders.
 * Order matters: Redux first (Intl reads the locale slice, Theme reads the
 * theme slice), then Intl, then Theme.
 */
export function AppProviders({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  return (
    <Provider store={store}>
      <IntlProviderShell>
        <ThemeProvider>{children}</ThemeProvider>
      </IntlProviderShell>
    </Provider>
  );
}
