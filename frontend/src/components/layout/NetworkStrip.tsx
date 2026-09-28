'use client';

import { useEffect } from 'react';

import { UbBox, UbStatusBanner } from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useTranslation } from 'src/hooks/useTranslation';
import { recoveryAnnounced, selectRecoveryAnnounced } from 'src/redux/slice/networkSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

/**
 * Part 19 §19.10.3 — the shell strip. It pushes content down and never
 * overlays, because a merchant mid-entry must not have a banner land on the
 * Save button.
 *
 * `online` shows nothing at all; the strip exists only when there is something
 * true to say.
 *
 * **It no longer mounts the probe.** This component lives in `UbAppShell`,
 * inside `RequireSession`, so mounting the probe here meant the network state
 * could only ever heal itself on a signed-in route — see
 * `src/components/providers/NetworkProbe.tsx`, which is mounted above the guard
 * and carries the reasoning. `withProbe: false` is what keeps the probe mounted
 * once rather than twice on the routes where both are present.
 */
export function NetworkStrip(): React.JSX.Element | null {
  const { state, pendingWrites } = useDegradedNetwork({ withProbe: false });
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const announced = useAppSelector(selectRecoveryAnnounced);

  // The transition back to `online` announces once: "Back online. 2 entries
  // sent." — and then never again until the next impairment.
  useEffect(() => {
    if (state !== 'online' || announced) return;
    dispatch(recoveryAnnounced());
    if (pendingWrites > 0) {
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'common.network.sent',
          params: { count: pendingWrites },
        })
      );
    }
  }, [state, announced, pendingWrites, dispatch, t]);

  if (state === 'online') return null;

  return (
    /* UAT D3 — "You are offline" is about this device, not about the
       statement a merchant prints while offline. */
    <UbBox data-testid="offline-banner" data-print="hide" className="px-4 pt-3 md:px-page">
      <UbStatusBanner
        tone={state === 'offline' ? 'offline' : 'warning'}
        title={state === 'offline' ? t('common.network.offline') : t('common.network.degraded')}
        description={
          pendingWrites > 0 ? t('common.network.pending', { count: pendingWrites }) : undefined
        }
      />
    </UbBox>
  );
}
