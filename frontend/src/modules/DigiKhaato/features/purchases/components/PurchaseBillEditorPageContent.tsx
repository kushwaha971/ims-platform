'use client';

import { useCallback, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Save, Send, Trash2 } from 'lucide-react';

import {
  UbButton,
  UbConfirmDialog,
  UbEmptyState,
  UbForm,
  UbGrid,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPanel,
  UbStack,
  UbText,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import { formatTimestamp } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { usePurchaseBillEditor } from '../hooks/usePurchaseBillEditor';
import {
  purchaseConflictResolved,
  purchaseDuplicateCleared,
} from '../redux/purchaseBillEditorSlice';
import { deletePurchaseBillDraft } from '../redux/purchaseBillThunk';
import { hasRecordableLines } from '../view-model/purchaseBillForm';

import { PurchaseBillHeaderSection } from './PurchaseBillHeaderSection';
import { PurchaseBillLinesSection } from './PurchaseBillLinesSection';
import { PurchaseBillTotalsPanel } from './PurchaseBillTotalsPanel';

/**
 * PUR-01 — `/purchases/bills/new` and `/[id]/edit`: the supplier and dates on
 * the left with the line grid (a COST column where the invoice has a rate);
 * the totals panel sticky on the right; Save draft and Record in the one-row
 * header. Record posts stock, the last cost and the supplier's khata in one
 * transaction on the server; the toast says the khata effect in the
 * supplier's terms (§8) and the bill opens.
 *
 * The seam PUR-02 plugs into is deliberately empty here: no "Paid now"
 * section and no Pay action until supplier payments exist.
 */
export function PurchaseBillEditorPageContent({
  documentId,
}: Readonly<{ documentId: string | null }>): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const editor = usePurchaseBillEditor(documentId);
  const { form, preview, editor: server, canWrite, save, record, values, today, regular } = editor;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const context = server.context;
  const hasLines = hasRecordableLines(values, preview);
  const locked = server.recording || !!server.recorded;
  const claimable = regular && values.itcEligible;

  const finishRecord = useCallback(async () => {
    if (!hasLines || locked) return;
    const result = await record();
    if (!result) return;
    const owed = (result.partyBalance ?? '0').replace('-', '');
    dispatch(
      showSnackbar({
        severity: 'success',
        id: 'purchases.editor.recorded',
        params: {
          number: result.bill.number ?? '',
          amount: formatInr(owed),
          name: result.bill.partySnapshot?.name ?? values.partyName,
        },
      })
    );
    router.push(`${ROUTES.PURCHASE_BILLS}/${result.bill.id}`);
  }, [hasLines, locked, record, dispatch, router, values.partyName]);

  const onPickSupplier = useCallback(
    (id: string, name: string) => {
      form.setValue('partyName', name);
      form.setValue('partyStateCode', null);
      form.setValue('partyCreditDays', null);
      dispatch(purchaseDuplicateCleared());
      if (!id) return;
      // The pick is saved at once, so the server can say where the supplier
      // is (inter-state or not) and their credit days — the list row a
      // search returns carries neither.
      void save(true).then((saved) => {
        const party = saved?.bill.party;
        if (!party) return;
        form.setValue('partyStateCode', party.stateCode);
        form.setValue('partyCreditDays', party.creditDays);
        form.reset(form.getValues(), { keepValues: true });
      });
    },
    [form, dispatch, save]
  );

  if (!canWrite) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('purchases.noAccess.title')}
          description={t('purchases.noAccess.writeBody')}
        />
      </UbPageShell>
    );
  }
  if (!context || (documentId && server.loadStatus !== 'succeeded')) {
    return <UbPageSkeleton variant="card" />;
  }

  const savedTime = server.savedAt ? (formatTimestamp(server.savedAt).split(', ')[1] ?? '') : '';
  const indicator =
    server.saveState === 'saving'
      ? t('purchases.draft.saving')
      : server.saveState === 'error'
        ? t('purchases.draft.error')
        : server.saveState === 'saved'
          ? t('purchases.draft.saved', { time: savedTime })
          : null;

  return (
    <UbPageShell>
      <UbPageHeader
        title={
          documentId || server.documentId
            ? t('purchases.editor.editTitle')
            : t('purchases.editor.newTitle')
        }
        controls={
          indicator ? (
            <UbText variant="caption" tone="tertiary" role="status">
              {indicator}
            </UbText>
          ) : undefined
        }
        actions={
          <>
            {server.documentId && (
              <UbButton
                variant="ghost"
                iconOnly="mobile"
                icon={<Trash2 className="h-4 w-4" aria-hidden />}
                onClick={() => setConfirmDelete(true)}
                disabled={locked}
              >
                {t('purchases.editor.delete')}
              </UbButton>
            )}
            <UbButton
              variant="secondary"
              iconOnly="mobile"
              icon={<Save className="h-4 w-4" aria-hidden />}
              onClick={() => void save(false)}
              busy={server.saveState === 'saving'}
              disabled={locked}
            >
              {t('purchases.editor.saveDraft')}
            </UbButton>
            <UbButton
              iconOnly="mobile"
              icon={<Send className="h-4 w-4" aria-hidden />}
              onClick={() => void finishRecord()}
              busy={server.recording}
              busyLabel={t('purchases.editor.recording')}
              disabled={!hasLines || locked}
              data-testid="purchase-record"
            >
              {t('purchases.editor.record')}
            </UbButton>
          </>
        }
      />
      <UbForm form={form} onSubmit={() => void finishRecord()}>
        <UbGrid columns={{ base: 1, lg: 3 }} gap={4}>
          <UbStack gap={4} className="lg:col-span-2">
            <UbPanel>
              <PurchaseBillHeaderSection
                form={form}
                today={today}
                regular={regular}
                interState={preview.isInterState}
                duplicate={server.duplicate}
                disabled={locked}
                onPickSupplier={onPickSupplier}
                onInvoiceNumberBlur={editor.checkDuplicate}
              />
            </UbPanel>
            <PurchaseBillLinesSection
              form={form}
              preview={preview}
              rateOptions={context.rateOptions}
              disabled={locked}
              onSubmitShortcut={() => void finishRecord()}
            />
          </UbStack>
          <PurchaseBillTotalsPanel
            form={form}
            preview={preview}
            claimable={claimable}
            warnings={server.warnings}
            disabled={locked}
          />
        </UbGrid>
      </UbForm>

      <UbConfirmDialog
        open={server.saveState === 'conflict'}
        onOpenChange={(open) => {
          // "Use the saved one": reopen the draft as the server has it.
          if (open) return;
          window.location.reload();
        }}
        title={t('purchases.draft.conflictTitle')}
        description={t('purchases.draft.conflictBody')}
        confirmLabel={t('purchases.draft.keepMine')}
        cancelLabel={t('purchases.draft.useServer')}
        closeLabel={t('common.action.close')}
        onConfirm={() => {
          const current = Number(server.error?.details?.current_version ?? server.version);
          dispatch(purchaseConflictResolved({ version: current }));
        }}
      />
      <UbConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('purchases.editor.deleteTitle')}
        description={t('purchases.editor.deleteBody')}
        confirmLabel={t('purchases.editor.delete')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        destructive
        onConfirm={() => {
          if (!server.documentId) return;
          void dispatch(deletePurchaseBillDraft(server.documentId)).then(() =>
            router.push(ROUTES.PURCHASE_BILLS)
          );
        }}
      />
    </UbPageShell>
  );
}
