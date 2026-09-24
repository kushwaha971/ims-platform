'use client';

import { useCallback, useMemo } from 'react';

import dynamic from 'next/dynamic';

import { LogOut } from 'lucide-react';

import {
  UbButton,
  UbConfirmDialog,
  UbEmptyState,
  UbGrid,
  UbPageHeader,
  UbPageShell,
  UbSkeleton,
  UbStack,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatTimestamp } from 'src/utils/dates';

import { useDevices } from '../hooks/useDevices';
import { deviceCaption, deviceTitle } from '../view-model/deviceDisplay';

import { DeviceCard } from './DeviceCard';

const RenameDeviceDialog = dynamic(
  () => import('./RenameDeviceDialog').then((module) => module.RenameDeviceDialog),
  { ssr: false }
);

/**
 * PLT-09 — Settings → Devices. Every person's own devices, whatever their
 * role (§12): logging a lost phone out is not a permission, it is a right.
 *
 * "Log out everywhere" is the page's one header action. It signs THIS device
 * out too (FR-3's decision) and the confirm says so, because a merchant who
 * expects to stay signed in on the laptop they are using will otherwise think
 * the product broke.
 */
export function DevicesPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const devices = useDevices();
  const { items, status, error, refetch } = devices;

  const labels = useMemo(
    () => ({
      current: t('sessions.current'),
      rename: t('sessions.rename.action'),
      logout: t('sessions.logout'),
      currentHint: t('sessions.current.hint'),
    }),
    [t]
  );

  const handleRevokeOpenChange = useCallback(
    (next: boolean) => {
      if (!next) devices.cancelRevoke();
    },
    [devices]
  );
  const handleLogoutAllOpenChange = useCallback(
    (next: boolean) => {
      if (!next) devices.cancelLogoutAll();
    },
    [devices]
  );

  const header = (
    <UbPageHeader
      title={t('sessions.title')}
      subtitle={t('sessions.subtitle')}
      actions={
        <UbButton
          variant="destructive"
          iconOnly="mobile"
          icon={<LogOut aria-hidden className="h-4 w-4" />}
          onClick={devices.requestLogoutAll}
          disabled={!devices.canWrite || status !== 'succeeded'}
        >
          {t('sessions.logoutAll')}
        </UbButton>
      }
    />
  );

  let body: React.ReactNode;
  if (status === 'failed') {
    body = (
      <UbEmptyState
        variant="error"
        title={t('sessions.error.title')}
        description={error?.message ?? t('sessions.error.body')}
        requestId={error?.requestId ?? null}
        requestIdLabel={t('common.error.reference')}
        action={
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        }
      />
    );
  } else if (status === 'idle' || (status === 'loading' && items.length === 0)) {
    body = (
      <UbGrid columns={{ base: 1, md: 2 }} gap={4}>
        <UbSkeleton variant="card" />
        <UbSkeleton variant="card" />
      </UbGrid>
    );
  } else {
    body = (
      <UbGrid columns={{ base: 1, md: 2 }} gap={4}>
        {items.map((session) => {
          const title = deviceTitle(session, t);
          return (
            <DeviceCard
              key={session.id}
              session={session}
              title={title}
              caption={deviceCaption(session, t, formatTimestamp)}
              labels={labels}
              canWrite={devices.canWrite}
              onRename={devices.openRename}
              onLogout={devices.requestRevoke}
            />
          );
        })}
      </UbGrid>
    );
  }

  const revokeTitle = devices.revokeTarget ? deviceTitle(devices.revokeTarget, t) : '';

  return (
    <UbPageShell header={header} width="measure">
      <UbStack gap={4}>{body}</UbStack>

      {devices.renameTarget && <RenameDeviceDialog devices={devices} />}

      <UbConfirmDialog
        open={Boolean(devices.revokeTarget)}
        onOpenChange={handleRevokeOpenChange}
        title={t('sessions.logout.confirm.title', { device: revokeTitle })}
        description={t('sessions.logout.confirm.body')}
        confirmLabel={t('sessions.logout')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        busy={devices.isRevoking}
        busyLabel={t('sessions.logout.working')}
        destructive
        onConfirm={() => void devices.confirmRevoke()}
      />

      <UbConfirmDialog
        open={devices.logoutAllOpen}
        onOpenChange={handleLogoutAllOpenChange}
        title={t('sessions.logoutAll')}
        description={t('sessions.logoutAll.confirm')}
        confirmLabel={t('sessions.logoutAll')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        busy={devices.isLoggingOutAll}
        busyLabel={t('sessions.logout.working')}
        destructive
        onConfirm={() => void devices.confirmLogoutAll()}
      />
    </UbPageShell>
  );
}
