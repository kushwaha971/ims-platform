'use client';

import { useEffect } from 'react';

import { SW_ENABLED } from 'src/constants';
import { useAppSelector } from 'src/hooks/useAppStore';
import { selectActiveTenant, selectSessionStatus } from 'src/redux/slice/sessionSlice';

/**
 * Part 19 §19.10.2, QA B50 — registers `/sw.js` after the page has loaded, and
 * tells it which business is open. Renders nothing.
 *
 * Registered on `load`, never during it: a worker installing alongside the first
 * paint competes for the same thin 4G link the merchant is waiting on. Only when
 * `NEXT_PUBLIC_SW_ENABLED` is on — local development keeps it off (§19.14), so
 * a stale worker cannot serve yesterday's chunks to a developer.
 *
 * The worker caches API reads per business and needs to be told the business:
 * `tenant` on every change, and `signed-out` only on a CONFIRMED sign-out. A cold
 * start has no session for its first few hundred milliseconds, and treating that
 * as signed out would delete the very cache an offline launch is about to read.
 *
 * It also marks `<html data-hydrated>` once React has hydrated: until then a
 * button is painted but deaf, and `globals.css` shows a pressed one as busy
 * rather than letting a tap vanish (B50's third criterion).
 */
export function ServiceWorkerRegistrar(): null {
  const tenantId = useAppSelector(selectActiveTenant)?.id ?? null;
  const status = useAppSelector(selectSessionStatus);

  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);

  useEffect(() => {
    if (!SW_ENABLED || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined;
    }
    const register = (): void => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    };
    if (document.readyState === 'complete') {
      register();
      return undefined;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  useEffect(() => {
    if (!SW_ENABLED || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const message =
      status === 'anonymous'
        ? { type: 'signed-out' }
        : tenantId
          ? { type: 'tenant', id: tenantId }
          : null;
    if (!message) return;
    void navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage(message);
    });
  }, [tenantId, status]);

  return null;
}
