'use client';

import { UbActionLink, UbBox, UbStatusBanner } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectActiveRole, selectActiveTenant } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';

/**
 * PLT-10 FRD §7 — "This business will be deleted on {date}. Cancel", on every
 * page of a business in its cool-off, read from the session so it needs no
 * request of its own. `dynamic()`-loaded by the shell only while the tenant is
 * `pending_deletion`, so no other business downloads it. Only an owner can
 * cancel (FRD §12), so only an owner is offered the link.
 */
export function PendingDeletionBanner(): React.JSX.Element | null {
  const { t } = useTranslation();
  const tenant = useAppSelector(selectActiveTenant);
  const role = useAppSelector(selectActiveRole);
  if (tenant?.status !== 'pending_deletion') return null;
  return (
    <UbBox className="px-4 pt-3 lg:px-6" data-print="hide">
      <UbStatusBanner
        tone="warning"
        title={t('data.banner.title', { date: formatBusinessDate(tenant.deletionScheduledFor) })}
        description={t('data.banner.body')}
        action={
          role === 'owner' ? (
            <UbActionLink href={ROUTES.SETTINGS_DATA} variant="outlineNeutral" size="sm">
              {t('data.cancel.action')}
            </UbActionLink>
          ) : undefined
        }
      />
    </UbBox>
  );
}
