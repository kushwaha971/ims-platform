'use client';

import { useCallback, useState } from 'react';

import dynamic from 'next/dynamic';

import { Trash2 } from 'lucide-react';

import {
  UbButton,
  UbConfirmDialog,
  UbPanel,
  UbPanelSection,
  UbStack,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatBusinessDate, msUntil } from 'src/utils/dates';

import { daysLeft } from '../view-model/accountDataDisplay';

import type { UseAccountDataResult } from '../hooks/useAccountData';

const DeleteBusinessDialog = dynamic(
  () => import('./DeleteBusinessDialog').then((module) => module.DeleteBusinessDialog),
  { ssr: false }
);

/**
 * PLT-10 FR-3/FR-4 — "Delete this business". Continue stays disabled until a
 * fresh export exists (FRD §6's export gate, EC-3); once requested, the panel
 * becomes the cool-off countdown with the one action that matters, Cancel.
 */
export function DeleteBusinessPanel({
  data,
}: Readonly<{ data: UseAccountDataResult }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const deletion = data.deletion;

  const openDialog = useCallback(() => setDialogOpen(true), []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const confirmCancel = useCallback(async () => {
    await data.cancel();
    setCancelOpen(false);
  }, [data]);

  if (!deletion) return null;
  const pending = deletion.status === 'pending_deletion';

  return (
    <UbPanel as="section">
      <UbPanelSection title={t('data.delete.title')}>
        {pending ? (
          <UbStack gap={3}>
            <UbStatusBanner
              tone="warning"
              title={t('data.delete.pending.title', {
                date: formatBusinessDate(deletion.scheduledFor),
              })}
              description={t('data.delete.pending.countdown', {
                days: daysLeft(msUntil(deletion.scheduledFor)),
              })}
            />
            <UbButton
              variant="secondary"
              className="self-start"
              onClick={() => setCancelOpen(true)}
              busy={data.isCancelling}
              disabled={!data.canWrite}
            >
              {t('data.cancel.action')}
            </UbButton>
          </UbStack>
        ) : (
          <UbStack gap={3}>
            <UbText variant="body-sm" tone="secondary">
              {t('data.delete.body', { days: deletion.coolOffDays })}
            </UbText>
            <UbText variant="body-sm" tone="secondary">
              {t('data.delete.consequence.gst')}
            </UbText>
            {!deletion.exportFresh ? (
              <UbText variant="caption" tone="warning">
                {t('data.delete.exportFirst')}
              </UbText>
            ) : null}
            <UbButton
              variant="destructive"
              className="self-start"
              icon={<Trash2 aria-hidden className="h-4 w-4" />}
              onClick={openDialog}
              disabled={!deletion.exportFresh || !data.canWrite}
            >
              {t('data.delete.action')}
            </UbButton>
          </UbStack>
        )}
      </UbPanelSection>

      {dialogOpen ? (
        <DeleteBusinessDialog data={data} open={dialogOpen} onClose={closeDialog} />
      ) : null}

      <UbConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t('data.cancel.title')}
        description={t('data.cancel.body')}
        confirmLabel={t('data.cancel.confirm')}
        cancelLabel={t('data.cancel.keep')}
        closeLabel={t('common.action.close')}
        onConfirm={() => void confirmCancel()}
        busy={data.isCancelling}
      />
    </UbPanel>
  );
}
