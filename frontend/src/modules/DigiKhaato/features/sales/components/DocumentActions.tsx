'use client';

import { useCallback, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Ban, CheckCircle2, FileOutput, HandCoins, Pencil, Undo2, XCircle } from 'lucide-react';

import { UbActionLink, UbButton, UbConfirmDialog } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';

import { convertEstimate, moveEstimate } from '../redux/salesFlowThunk';
import {
  canApply,
  canReturn,
  challanActions,
  estimateActions,
  isVoidable,
  salesOrderActions,
} from '../view-model/flowDisplay';

import type { SalesDocument } from '../types/sales.types';

/* Each dialog loads with the tap that opens it (a form in the chunk that opens it). */
const VoidDialogLazy = dynamic(
  () => import('./VoidDocumentDialog').then((m) => m.VoidDocumentDialog),
  { ssr: false }
);
const CancelOrderDialogLazy = dynamic(
  () => import('./CancelOrderDialog').then((m) => m.CancelOrderDialog),
  { ssr: false }
);
const ApplyDialogLazy = dynamic(
  () => import('./ApplyCreditDialog').then((m) => m.ApplyCreditDialog),
  { ssr: false }
);

type Open = 'void' | 'apply' | 'convert' | 'reject' | 'cancelOrder' | 'voidChallan' | null;

/**
 * The header actions a document's kind and status allow — SAL-01 §9, SAL-04
 * §9, SAL-05 §6 — decided by `flowDisplay` and gated by codename:
 *
 * * estimate — Edit (draft); Mark accepted / Mark rejected (sent); Convert to
 *   invoice (sent, accepted, expired — the single primary on accepted, §8);
 * * invoice — Return items (a credit note against it), Void (owner/admin);
 * * credit note — Apply credit (open credit left), Void (owner/admin);
 * * sales order (Shop item 3) — Edit (draft); Convert to invoice, the primary,
 *   and Cancel with a reason (open).
 *
 * Icon-only on a phone, so the header stays one row (owner's rule).
 */
export function DocumentActions({ doc }: Readonly<{ doc: SalesDocument }>): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => setOpen(null), []);
  const icon = (Icon: typeof Ban) => <Icon className="h-4 w-4" aria-hidden />;

  const move = useCallback(
    async (to: 'accepted' | 'rejected') => {
      await dispatch(moveEstimate({ id: doc.id, move: to }));
      setOpen(null);
    },
    [dispatch, doc.id]
  );
  const convert = useCallback(async () => {
    setBusy(true);
    const result = await dispatch(
      convertEstimate({
        id: doc.id,
        kind: doc.kind === 'sales_order' || doc.kind === 'delivery_challan' ? doc.kind : 'estimate',
      })
    );
    setBusy(false);
    if (!convertEstimate.fulfilled.match(result)) return;
    const changed = result.payload.warnings.length;
    if (changed) {
      dispatch(
        showSnackbar({
          severity: 'warning',
          id: 'sales.estimate.convert.warnings',
          params: { count: changed },
        })
      );
    }
    router.push(`${ROUTES.SALES_INVOICES}/${result.payload.document.id}/edit`);
  }, [dispatch, doc.id, doc.kind, router]);

  const estimate = doc.kind === 'estimate';
  const order = doc.kind === 'sales_order';
  const challan = doc.kind === 'delivery_challan';
  const moves = estimateActions(doc.status);
  const orderMoves = salesOrderActions(doc.status);
  const challanMoves = challanActions(doc.status);
  // SAL-05 EC-9 — the invoice it became was voided (or its draft discarded): convert again.
  const reconvert =
    doc.status === 'converted' &&
    (!doc.links.convertedTo || doc.links.convertedTo.status === 'void');
  const writesEstimates = can('sales.estimate.write');
  const voidable = isVoidable(doc) && can('sales.invoice.void') && !estimate && !order && !challan;
  return (
    <>
      {challan && doc.status === 'draft' && can('sales.invoice.write') && (
        <UbActionLink
          href={`${ROUTES.SALES_CHALLANS}/${doc.id}/edit`}
          variant="secondary"
          iconOnly="mobile"
          icon={icon(Pencil)}
        >
          {t('sales.detail.edit')}
        </UbActionLink>
      )}
      {challan && challanMoves.void && can('sales.invoice.void') && (
        <UbButton
          variant="ghost"
          iconOnly="mobile"
          icon={icon(Ban)}
          onClick={() => setOpen('voidChallan')}
          data-testid="challan-void"
        >
          {t('sales.challan.void.action')}
        </UbButton>
      )}
      {challan && can('sales.invoice.write') && (challanMoves.convert || reconvert) && (
        <UbButton
          variant="primary"
          iconOnly="mobile"
          icon={icon(FileOutput)}
          onClick={() => setOpen('convert')}
          busy={busy}
          busyLabel={t('sales.estimate.convert.working')}
          data-testid="challan-convert"
        >
          {t('sales.estimate.convert.action')}
        </UbButton>
      )}
      {order && doc.status === 'draft' && writesEstimates && (
        <UbActionLink
          href={`${ROUTES.SALES_ORDERS}/${doc.id}/edit`}
          variant="secondary"
          iconOnly="mobile"
          icon={icon(Pencil)}
        >
          {t('sales.detail.edit')}
        </UbActionLink>
      )}
      {order && writesEstimates && orderMoves.cancel && (
        <UbButton
          variant="ghost"
          iconOnly="mobile"
          icon={icon(XCircle)}
          onClick={() => setOpen('cancelOrder')}
          data-testid="order-cancel"
        >
          {t('sales.order.cancel.action')}
        </UbButton>
      )}
      {order &&
        writesEstimates &&
        can('sales.invoice.write') &&
        (orderMoves.convert || reconvert) && (
          <UbButton
            variant="primary"
            iconOnly="mobile"
            icon={icon(FileOutput)}
            onClick={() => setOpen('convert')}
            busy={busy}
            busyLabel={t('sales.estimate.convert.working')}
            data-testid="order-convert"
          >
            {t('sales.estimate.convert.action')}
          </UbButton>
        )}
      {estimate && doc.status === 'draft' && writesEstimates && (
        <UbActionLink
          href={`${ROUTES.SALES_ESTIMATES}/${doc.id}/edit`}
          variant="secondary"
          iconOnly="mobile"
          icon={icon(Pencil)}
        >
          {t('sales.detail.edit')}
        </UbActionLink>
      )}
      {estimate && writesEstimates && moves.reject && (
        <UbButton
          variant="ghost"
          iconOnly="mobile"
          icon={icon(XCircle)}
          onClick={() => setOpen('reject')}
        >
          {t('sales.estimate.markRejected')}
        </UbButton>
      )}
      {estimate && writesEstimates && moves.accept && (
        <UbButton
          variant="secondary"
          iconOnly="mobile"
          icon={icon(CheckCircle2)}
          onClick={() => void move('accepted')}
          data-testid="estimate-accept"
        >
          {t('sales.estimate.markAccepted')}
        </UbButton>
      )}
      {estimate &&
        writesEstimates &&
        can('sales.invoice.write') &&
        (moves.convert || reconvert) && (
          <UbButton
            variant={doc.status === 'sent' ? 'secondary' : 'primary'}
            iconOnly="mobile"
            icon={icon(FileOutput)}
            onClick={() => setOpen('convert')}
            busy={busy}
            busyLabel={t('sales.estimate.convert.working')}
            data-testid="estimate-convert"
          >
            {t('sales.estimate.convert.action')}
          </UbButton>
        )}
      {canReturn(doc) && can('sales.credit_note.write') && (
        <UbActionLink
          href={`${ROUTES.SALES_CREDIT_NOTES}/new?against=${encodeURIComponent(doc.id)}`}
          variant="secondary"
          iconOnly="mobile"
          icon={icon(Undo2)}
          data-testid="invoice-return"
        >
          {t('sales.creditNote.returnItems')}
        </UbActionLink>
      )}
      {canApply(doc) && can('sales.credit_note.write') && (
        <UbButton
          variant="secondary"
          iconOnly="mobile"
          icon={icon(HandCoins)}
          onClick={() => setOpen('apply')}
          data-testid="credit-apply"
        >
          {t('sales.creditNote.apply.action')}
        </UbButton>
      )}
      {voidable && (
        <UbButton
          variant="ghost"
          iconOnly="mobile"
          icon={icon(Ban)}
          onClick={() => setOpen('void')}
          data-testid="document-void"
        >
          {t('sales.void.action')}
        </UbButton>
      )}
      {open === 'void' && <VoidDialogLazy doc={doc} onClose={close} />}
      {open === 'apply' && <ApplyDialogLazy note={doc} onClose={close} />}
      {open === 'cancelOrder' && <CancelOrderDialogLazy doc={doc} onClose={close} />}
      {open === 'voidChallan' && <CancelOrderDialogLazy doc={doc} onClose={close} move="void" />}
      <UbConfirmDialog
        open={open === 'convert'}
        onOpenChange={(next) => !next && close()}
        title={t(order || challan ? 'sales.order.convert.title' : 'sales.estimate.convert.title')}
        description={t(
          order
            ? 'sales.order.convert.confirm'
            : challan
              ? 'sales.challan.convert.confirm'
              : 'sales.estimate.convert.confirm',
          { number: doc.number ?? '' }
        )}
        confirmLabel={t('sales.estimate.convert.action')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        onConfirm={() => void convert()}
      />
      <UbConfirmDialog
        open={open === 'reject'}
        onOpenChange={(next) => !next && close()}
        title={t('sales.estimate.rejectTitle', { number: doc.number ?? '' })}
        description={t('sales.estimate.rejectBody')}
        confirmLabel={t('sales.estimate.markRejected')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        destructive
        onConfirm={() => void move('rejected')}
      />
    </>
  );
}
