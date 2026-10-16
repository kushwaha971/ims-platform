'use client';

import { useCallback, useState } from 'react';

import dynamic from 'next/dynamic';
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
  UbTotalDock,
  useIsMobileLayer,
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
import { hasRecordableLines, type PurchasePaymentRow } from '../view-model/purchaseBillForm';
import { recordedToast } from '../view-model/purchaseToasts';

import { PurchaseBillHeaderSection } from './PurchaseBillHeaderSection';
import { PurchaseBillLinesSection } from './PurchaseBillLinesSection';
import { PurchaseBillTotalsPanel } from './PurchaseBillTotalsPanel';

import type { PurchaseKind } from '../types/purchase.types';

/* The "Paid now" sheet loads with the tap on Record, never with the editor. */
const PaidNowDrawerLazy = dynamic(
  () => import('./PurchasePaidNowDrawer').then((m) => m.PurchasePaidNowDrawer),
  { ssr: false }
);

/**
 * PUR-01 — `/purchases/bills/new` and `/[id]/edit`: the supplier and dates on
 * the left with the line grid (a COST column where the invoice has a rate);
 * the totals panel sticky on the right; Save draft and Record in the one-row
 * header. Record posts stock, the last cost and the supplier's khata in one
 * transaction on the server; the toast says the khata effect in the
 * supplier's terms (§8) and the bill opens.
 *
 * PUR-02 / FR-6h — Record asks one more question when the role may pay
 * suppliers: "Paid now?" (`PurchasePaidNowDrawer`, loaded with the tap). The
 * money goes to the server with the record call and becomes a PAYOUT voucher
 * allocated to this bill in the same transaction; "Pay later" records it on
 * credit. A role that may not pay suppliers, or a ₹0 bill, records at once.
 */
export function PurchaseBillEditorPageContent({
  documentId,
  kind = 'purchase_bill',
}: Readonly<{ documentId: string | null; kind?: PurchaseKind }>): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const editor = usePurchaseBillEditor(documentId, kind);
  // Shop item 3 — the same editor writes an order: Send in place of Record, never paid.
  const order = kind === 'purchase_order';
  const home = order ? ROUTES.PURCHASE_ORDERS : ROUTES.PURCHASE_BILLS;
  const { form, preview, editor: server, canWrite, save, record, values, today, regular } = editor;
  const { validate, canPayNow } = editor;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [paying, setPaying] = useState(false);

  const context = server.context;
  const hasLines = hasRecordableLines(values, preview);
  const isMobileLayer = useIsMobileLayer();
  const locked = server.recording || !!server.recorded;
  const claimable = regular && values.itcEligible && !order;

  const finishRecord = useCallback(
    async (payment: readonly PurchasePaymentRow[] | null) => {
      if (!hasLines || locked) return;
      const result = await record(payment);
      if (!result) return;
      setPaying(false);
      dispatch(
        showSnackbar(
          order
            ? {
                severity: 'success',
                id: 'purchases.order.sent',
                params: { number: result.bill.number ?? '' },
              }
            : recordedToast(result, values.partyName)
        )
      );
      router.push(`${home}/${result.bill.id}`);
    },
    [hasLines, locked, record, dispatch, router, values.partyName, order, home]
  );

  /* The header rules run BEFORE the sheet opens: asking "Paid now?" about a
     bill that is then refused for a missing supplier is a question wasted. */
  const startRecord = useCallback(async () => {
    if (!hasLines || locked) return;
    if (order || !canPayNow || preview.grandTotal === '0.00') {
      void finishRecord(null);
      return;
    }
    if (await validate()) setPaying(true);
  }, [hasLines, locked, order, canPayNow, preview.grandTotal, validate, finishRecord]);

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
            ? t(order ? 'purchases.order.editTitle' : 'purchases.editor.editTitle')
            : t(order ? 'purchases.order.newTitle' : 'purchases.editor.newTitle')
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
              /* The phone docks Save and Record under the total (below). */
              className="max-lg:hidden"
            >
              {t('purchases.editor.saveDraft')}
            </UbButton>
            <UbButton
              iconOnly="mobile"
              icon={<Send className="h-4 w-4" aria-hidden />}
              onClick={() => void startRecord()}
              busy={server.recording}
              busyLabel={t(order ? 'purchases.order.sending' : 'purchases.editor.recording')}
              disabled={!hasLines || locked}
              data-testid="purchase-record"
              className="max-lg:hidden"
            >
              {t(order ? 'purchases.order.send' : 'purchases.editor.record')}
            </UbButton>
          </>
        }
      />
      <UbForm form={form} onSubmit={() => void startRecord()}>
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
                order={order}
              />
            </UbPanel>
            <PurchaseBillLinesSection
              form={form}
              preview={preview}
              rateOptions={context.rateOptions}
              disabled={locked}
              onSubmitShortcut={() => void startRecord()}
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

      {/* docs/mobile-redesign (A14) — the total and the finishing actions,
          docked on a phone (see UbTotalDock). */}
      {isMobileLayer && (
        <UbTotalDock
          data-testid="purchase-dock"
          totalLabel={t('purchases.totals.grand')}
          total={formatInr(preview.grandTotal)}
        >
          <UbButton
            variant="secondary"
            onClick={() => void save(false)}
            busy={server.saveState === 'saving'}
            disabled={locked}
          >
            {t('purchases.editor.saveDraft')}
          </UbButton>
          <UbButton
            onClick={() => void startRecord()}
            busy={server.recording}
            busyLabel={t(order ? 'purchases.order.sending' : 'purchases.editor.recording')}
            disabled={!hasLines || locked}
          >
            {t(order ? 'purchases.order.send' : 'purchases.editor.record')}
          </UbButton>
        </UbTotalDock>
      )}
      {paying && (
        <PaidNowDrawerLazy
          grandTotal={preview.grandTotal}
          busy={server.recording}
          onClose={() => setPaying(false)}
          onConfirm={(rows) => void finishRecord(rows)}
          onPayLater={() => void finishRecord(null)}
        />
      )}

      <UbConfirmDialog
        open={server.saveState === 'conflict'}
        onOpenChange={(open) => {
          // "Use the saved one": reopen the draft as the server has it. On /new a
          // recovered draft (ADR-063) is opened by its id, which a reload would lose.
          if (open) return;
          if (!documentId && server.documentId) router.replace(`${home}/${server.documentId}/edit`);
          else window.location.reload();
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
          void dispatch(deletePurchaseBillDraft({ id: server.documentId, kind })).then(() =>
            router.push(home)
          );
        }}
      />
    </UbPageShell>
  );
}
