'use client';

import {
  UbButton,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbSkeleton,
  UbStack,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectActiveRole } from 'src/redux/slice/sessionSlice';

import { useAccountData } from '../hooks/useAccountData';

import { DataExportPanel } from './DataExportPanel';
import { DeleteBusinessPanel } from './DeleteBusinessPanel';
import { SupportAccessPanel } from './SupportAccessPanel';

function OwnerDataPage(): React.JSX.Element {
  const { t } = useTranslation();
  const data = useAccountData();

  if (data.status === 'failed') {
    return (
      <UbEmptyState
        variant="error"
        title={t('data.error.title')}
        description={data.error?.message ?? t('data.error.body')}
        requestId={data.error?.requestId ?? null}
        requestIdLabel={t('common.error.reference')}
        action={
          <UbButton variant="secondary" onClick={data.refetch}>
            {t('common.action.retry')}
          </UbButton>
        }
      />
    );
  }
  if (!data.deletion) return <UbSkeleton variant="form" count={3} />;

  return (
    <UbStack gap={4}>
      <DataExportPanel data={data} />
      <SupportAccessPanel data={data} />
      <DeleteBusinessPanel data={data} />
    </UbStack>
  );
}

/**
 * PLT-10 — Settings → Your data (owner only, FRD §12). Three things a business
 * owner can do with the business itself: take everything away as a file, let
 * support in for a day (PLT-14's consent), and delete it with thirty days to
 * change their mind.
 *
 * The role is checked by NAME, not by permission — an admin holds
 * `platform.tenant.manage` and must still be told no; the server refuses them
 * too, this only spares them a page of 403s.
 */
export function AccountDataPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const role = useAppSelector(selectActiveRole);
  const header = <UbPageHeader title={t('data.title')} subtitle={t('data.subtitle')} />;

  return (
    <UbPageShell header={header} width="measure">
      {role === 'owner' ? (
        <OwnerDataPage />
      ) : (
        <UbEmptyState
          variant="firstUse"
          title={t('data.ownerOnly.title')}
          description={t('data.ownerOnly.body')}
        />
      )}
    </UbPageShell>
  );
}
