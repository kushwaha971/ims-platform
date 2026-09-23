'use client';

import { useCallback } from 'react';

import { UbSnackbar } from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { hideSnackbar, selectSnackbar } from 'src/redux/slice/snackbarSlice';

/**
 * The host subscribes to `snackbarSlice` and passes the message down as props,
 * because a `Ub*` component never reads Redux and never reaches for
 * `react-intl` (§19.1.2). This is the single toast channel's only mount point.
 *
 * ── CR-2026-09-19-E ─────────────────────────────────────────────────────────
 *  · **It resolves `id`/`params` here.** BrandHub's `CustomerSnackbar` does the
 *    same — `const message = id ? t(id, params) : snackbarMessage` — and for
 *    the same reason: most dispatchers are below the React tree (the axios
 *    interceptor, the transport host in `src/redux/store.ts`) and have no
 *    `t()`. Before this, a key dispatched as `message` reached the user as the
 *    literal string `tenant.switcher.staleTab`.
 *  · **It is mounted in `AppProviders`, not in the app shell.** It used to hang
 *    off `UbAppShell`, which only the `(app)` route group renders — so every
 *    failure on login, sign-up, password reset, onboarding, the tenant chooser
 *    and the public document routes had NOWHERE to surface, and each of those
 *    screens grew its own error banner to compensate. That is precisely the
 *    arrangement BrandHub arrived at too: `CustomerSnackbar` is mounted in
 *    `app/customer/layout.tsx`, the layout that wraps the portal AND its
 *    `/auth/*` routes, "since the root layout's MUI AppLoaderAndSnackbar is
 *    mounted only on non-customer routes, so these routes have no renderer for
 *    snackbarSlice without it".
 */
export function SnackbarHost(): React.JSX.Element {
  const { snackbarOpen, snackbarMessage, snackbarSeverity, id, params, requestId } =
    useAppSelector(selectSnackbar);
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const onDismiss = useCallback(() => {
    dispatch(hideSnackbar());
  }, [dispatch]);

  const resolved = id ? t(id, params) : snackbarMessage;

  return (
    <UbSnackbar
      message={snackbarOpen && resolved ? resolved : null}
      severity={snackbarSeverity}
      requestId={requestId}
      requestIdLabel={t('common.error.reference')}
      onDismiss={onDismiss}
      dismissLabel={t('common.action.dismiss')}
    />
  );
}
