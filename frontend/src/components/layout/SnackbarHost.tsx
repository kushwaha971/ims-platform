'use client';

import { useCallback } from 'react';

import { UbSnackbar } from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectSnackbarQueue, snackbarDismissed } from 'src/redux/slice/snackbarSlice';

/**
 * The host subscribes to `snackbarSlice` and passes the queue down as props,
 * because a `Ub*` component never reads Redux and never reaches for
 * `react-intl` (§19.1.2). This is the single toast channel's only mount point.
 */
export function SnackbarHost(): React.JSX.Element {
  const messages = useAppSelector(selectSnackbarQueue);
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const onDismiss = useCallback(
    (id: string) => {
      dispatch(snackbarDismissed(id));
    },
    [dispatch]
  );

  return (
    <UbSnackbar
      messages={messages}
      onDismiss={onDismiss}
      dismissLabel={t('common.action.dismiss')}
    />
  );
}
