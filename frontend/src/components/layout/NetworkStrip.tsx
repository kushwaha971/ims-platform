'use client';

import { useEffect } from 'react';

import { UbBox, UbStatusBanner } from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useTranslation } from 'src/hooks/useTranslation';
import { recoveryAnnounced, selectRecoveryAnnounced } from 'src/redux/slice/networkSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

/**
 * Part 19 §19.10.3 — the shell strip, and the ONE place the probe effect is
 * mounted. It pushes content down and never overlays, because a merchant
 * mid-entry must not have a banner land on the Save button.
 *
 * `online` shows nothing at all; the strip exists only when there is something
 * true to say.
 */
export function NetworkStrip(): React.JSX.Element | null {
  const { state, pendingWrites } = useDegradedNetwork({ withProbe: true });
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
          message: t('common.network.sent', { count: pendingWrites }),
        })
      );
    }
  }, [state, announced, pendingWrites, dispatch, t]);

  if (state === 'online') return null;

  return (
    <UbBox data-testid="offline-banner" className="px-4 pt-3 md:px-page">
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
