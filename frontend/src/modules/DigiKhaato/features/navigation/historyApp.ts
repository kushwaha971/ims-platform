'use client';

import { useSyncExternalStore } from 'react';

const CHANGED = 'yourkhata:history-app';

const subscribe = (changed: () => void): (() => void) => {
  window.addEventListener('popstate', changed);
  window.addEventListener(CHANGED, changed);
  return () => {
    window.removeEventListener('popstate', changed);
    window.removeEventListener(CHANGED, changed);
  };
};

/** QA B11/B42: a shared URL keeps the app that opened this browser history entry. */
export function useHistoryApp(path: string | null, tenant: string | null): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      const saved: unknown = window.history.state?.yourkhataApp;
      if (!saved || typeof saved !== 'object') return null;
      const entry = saved as Record<string, unknown>;
      return path === window.location.pathname &&
        entry.path === path &&
        entry.tenant === tenant &&
        typeof entry.app === 'string'
        ? entry.app
        : null;
    },
    () => null
  );
}

export function rememberHistoryApp(
  path: string | null,
  tenant: string | null,
  app: string | null
): void {
  if (!path || !tenant || !app || path !== window.location.pathname) return;
  const saved = window.history.state?.yourkhataApp;
  if (saved?.path === path && saved?.tenant === tenant && saved?.app === app) return;
  // Keep Next's router metadata; replacing it would break Back and Forward.
  window.history.replaceState(
    {
      ...window.history.state,
      yourkhataApp: { path, tenant, app },
    },
    ''
  );
  window.dispatchEvent(new Event(CHANGED));
}
