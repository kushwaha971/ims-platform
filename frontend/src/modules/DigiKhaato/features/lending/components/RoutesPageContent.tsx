'use client';

import { useEffect, useState } from 'react';

import { CompactCard } from 'src/components/records/CompactCard';
import {
  UbButton,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { fetchLendingRoutes, saveLendingRoute } from '../redux/lendingThunk';
import { selectLendingToday } from '../redux/lendingTodaySlice';

/**
 * `/lending/routes` (FRD LEN-07): the collection rounds. A loan joins a route
 * when it is given; today's round lists the stops in that order.
 */
export function RoutesPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { routes } = useAppSelector(selectLendingToday);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('lending') && can('lending.route.read');
  const canManage = hasModule('lending') && can('lending.route.manage');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLendingRoutes());
    return () => promise.abort();
  }, [canRead, dispatch]);

  const add = async () => {
    if (!name.trim()) {
      setError(t('lending.routes.name.required'));
      return;
    }
    const result = await dispatch(saveLendingRoute(name.trim()));
    if (saveLendingRoute.fulfilled.match(result)) {
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'lending.routes.added',
          params: { name: name.trim() },
        })
      );
      setName('');
      void dispatch(fetchLendingRoutes());
    } else {
      setError(result.payload?.message ?? '');
    }
  };

  if (!canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('lending.noAccess.title')}
          description={t('lending.noAccess.body')}
        />
      </UbPageShell>
    );
  }
  return (
    <UbPageShell width="measure">
      <UbPageHeader title={t('lending.routes.title')} />
      <UbStack gap={3} data-testid="lending-routes">
        {routes.length === 0 ? (
          <UbText variant="body-sm" tone="tertiary">
            {t('lending.routes.empty')}
          </UbText>
        ) : (
          <CompactCard padded>
            <UbStack as="ul" gap={0} aria-label={t('lending.routes.title')}>
              {routes.map((r) => (
                <UbStack
                  as="li"
                  key={r.id}
                  gap={0}
                  className="border-b border-border-hairline py-3 last:border-b-0"
                >
                  <UbListItemText
                    primary={r.name}
                    secondary={[
                      t('lending.routes.loans', { count: r.loans ?? 0 }),
                      r.agent ? t('lending.routes.agent', { name: r.agent.name }) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                </UbStack>
              ))}
            </UbStack>
          </CompactCard>
        )}
        {canManage && (
          <CompactCard padded>
            <UbStack gap={2}>
              <UbTextInput
                id="lending-route-name"
                name="lending-route-name"
                aria-label={t('lending.routes.name')}
                placeholder={t('lending.routes.name.placeholder')}
                value={name}
                onChange={(next) => {
                  setName(next);
                  setError('');
                }}
                invalid={!!error}
                maxLength={60}
              />
              {error && (
                <UbText variant="caption" tone="formError">
                  {error}
                </UbText>
              )}
              <UbButton variant="secondary" onClick={() => void add()}>
                {t('lending.routes.add')}
              </UbButton>
            </UbStack>
          </CompactCard>
        )}
      </UbStack>
    </UbPageShell>
  );
}
