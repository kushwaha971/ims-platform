'use client';

import { lazy, Suspense, type ReactNode } from 'react';

import { Provider } from 'react-redux';

import { SnackbarHost } from 'src/components/layout/SnackbarHost';
import { IntlProviderShell } from 'src/components/providers/IntlProviderShell';
import { NetworkProbe } from 'src/components/providers/NetworkProbe';
import { PreferencesBootstrap } from 'src/components/providers/PreferencesBootstrap';
import { ThemeProvider } from 'src/components/providers/ThemeProvider';
import { WhiteLabelSync } from 'src/components/providers/WhiteLabelSync';
import { ANALYTICS_ENABLED, POSTHOG_KEY } from 'src/constants';
import { store } from 'src/redux/store';

/**
 * DEC-017 — analytics and feedback. Its own chunk, fetched after hydration and
 * only by a build that has analytics on: statically imported, the host and its
 * rules put 0.9 KB on the shell of every route (measured), for something most
 * builds never run. `React.lazy`, not `next/dynamic`: that was tried first and
 * its own loader cost the shell MORE than the import it was deferring (+1.4 KB).
 */
const AnalyticsHost = lazy(() =>
  import('src/components/providers/AnalyticsHost').then((m) => ({ default: m.AnalyticsHost }))
);
const ANALYTICS_ON = ANALYTICS_ENABLED && Boolean(POSTHOG_KEY);

/**
 * Part 19 §19.7.2 / §19.11.1 — the provider stack `app/layout.tsx` renders.
 * Order matters: Redux first (Intl reads the locale slice, Theme reads the
 * theme slice), then Intl, then Theme.
 *
 * `PreferencesBootstrap` sits directly inside `Provider` and outside
 * `IntlProviderShell`, which is the whole point of its position: it restores the
 * saved locale in a layout effect, so the restore lands before the browser paints
 * and `IntlProviderShell` renders the right language in the first frame rather
 * than flashing English. Nothing read those cookies back before it existed.
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
 *
 * `NetworkProbe` is mounted here for the same reason and it is the same bug:
 * §19.10.3's connectivity probe hung off `UbAppShell`, so the only mechanism
 * that can return the network state to `online` without the merchant generating
 * traffic ran on the signed-in routes and nowhere else — while `/login` feeds
 * that state on every visit through `SessionBootstrap`'s `GET /auth/me`. It
 * renders `null` and issues nothing while the state is `online`, which is its
 * initial value, so the public routes pay an effect and no requests.
 */
export function AppProviders({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  return (
    <Provider store={store}>
      <PreferencesBootstrap>
        <IntlProviderShell>
          <ThemeProvider>
            {children}
            <SnackbarHost />
            <NetworkProbe />
            {/* WLB-01 FR-4 — the active tenant's brand ramp on <html>. */}
            <WhiteLabelSync />
            {ANALYTICS_ON && (
              <Suspense fallback={null}>
                <AnalyticsHost />
              </Suspense>
            )}
          </ThemeProvider>
        </IntlProviderShell>
      </PreferencesBootstrap>
    </Provider>
  );
}
