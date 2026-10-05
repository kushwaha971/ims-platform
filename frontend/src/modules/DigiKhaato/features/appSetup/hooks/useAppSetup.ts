'use client';

import { useCallback, useEffect, useState } from 'react';

import { getAppSetup, hideAppSetup, type AppSetup } from '../api/appSetupService';

/**
 * One app home's setup checklist. Component state rather than a slice, for
 * the reason `usePartySearch` gives: it belongs to the one screen showing it,
 * nothing else reads it, and a slice would ship to every route in the shell.
 * It is re-read each time the home mounts, so a step done elsewhere shows as
 * done on the way back.
 */
export interface UseAppSetupResult {
  readonly setup: AppSetup | null;
  readonly hiding: boolean;
  readonly hide: () => void;
}

export function useAppSetup(app: string): UseAppSetupResult {
  const [setup, setSetup] = useState<AppSetup | null>(null);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getAppSetup(app, controller.signal)
      .then(setSetup)
      .catch(() => undefined);
    return () => controller.abort();
  }, [app]);

  const hide = useCallback(() => {
    setHiding(true);
    hideAppSetup(app)
      .then(setSetup)
      .catch(() => undefined)
      .finally(() => setHiding(false));
  }, [app]);

  return { setup, hiding, hide };
}
