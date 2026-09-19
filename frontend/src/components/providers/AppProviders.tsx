'use client';

import { type ReactNode } from 'react';

import { Provider } from 'react-redux';

import { SnackbarHost } from 'src/components/layout/SnackbarHost';
import { IntlProviderShell } from 'src/components/providers/IntlProviderShell';
import { ThemeProvider } from 'src/components/providers/ThemeProvider';
import { store } from 'src/redux/store';

/**
 * Part 19 §19.7.2 / §19.11.1 — the provider stack `app/layout.tsx` renders.
 * Order matters: Redux first (Intl reads the locale slice, Theme reads the
 * theme slice), then Intl, then Theme.
 *
 * CR-2026-09-19-E — `SnackbarHost` is mounted HERE, as a sibling of `children`,
 * rather than inside `UbAppShell`. §19.12.2 calls the snackbar the single
 * channel through which no failure is ever silent; hanging it off the `(app)`
 * shell made that untrue for every route outside `(app)` — login, sign-up,
 * password reset, onboarding, the tenant chooser and the public document
 * routes — which is why each of those screens had grown an error banner of its
 * own. This is BrandHub's arrangement: `CustomerSnackbar` sits in
 * `app/customer/layout.tsx`, above both the portal and its `/auth/*` routes.
 *
 * It sits inside `IntlProvider` because the host resolves i18n keys, and inside
 * `Provider` because it reads the slice. It renders nothing until a message is
 * dispatched — only the two empty live regions of `MLToaster`.
 */
export function AppProviders({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  return (
    <Provider store={store}>
      <IntlProviderShell>
        <ThemeProvider>
          {children}
          <SnackbarHost />
        </ThemeProvider>
      </IntlProviderShell>
    </Provider>
  );
}
