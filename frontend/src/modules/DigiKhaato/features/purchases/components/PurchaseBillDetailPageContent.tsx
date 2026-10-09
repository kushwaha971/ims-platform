'use client';

import { useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Ban, FileOutput, Pencil, Undo2, XCircle } from 'lucide-react';

import {
  UbActionLink,
  UbAmount,
  UbButton,
  UbDivider,
  UbEmptyState,
  UbGrid,
  UbInfoRow,
  UbLink,
  UbPageHeader,
  UbPageHeaderMobileActions,
  UbPageShell,
  UbPageSkeleton,
  UbPanel,
  UbStack,
  UbStatusBadge,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate, formatTimestamp } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { taxRateLabel } from 'src/utils/taxRateLabel';

import { RecordPaymentButton } from '../../payments/components/RecordPaymentButton';
import { usePurchaseBillDetail } from '../hooks/usePurchaseBillDetail';
import { movePurchaseOrder } from '../redux/purchaseBillThunk';
import { PURCHASE_STATUS_TONE, supplierName, trimQty } from '../view-model/purchaseBillDisplay';

import type { PurchaseBill, PurchaseKind } from '../types/purchase.types';

/* The void form (RHF, the resolver, the schema) loads with the tap that opens it. */
const VoidDialogLazy = dynamic(
  () => import('./PurchaseBillVoidDialog').then((m) => m.PurchaseBillVoidDialog),
  { ssr: false }
);

const OrderCancelDialogLazy = dynamic(
  () => import('./PurchaseOrderCancelDialog').then((m) => m.PurchaseOrderCancelDialog),
  { ssr: false }
);

/* Shop P0 — "Return goods": the lines, the reason and the stock switch load with the tap. */
const DebitNoteDrawerLazy = dynamic(
  () => import('./DebitNoteDrawer').then((m) => m.DebitNoteDrawer),
  { ssr: false }
);

const VOIDABLE = new Set(['recorded', 'partially_paid', 'paid', 'overdue']);
/**
 * Shop item 3 — an order is billed once; again only if that bill was voided or its
 * draft discarded (the server's rule, so the button never offers a 409).
 */
const billable = (doc: PurchaseBill): boolean =>
  doc.status === 'sent' ||
  (doc.status === 'billed' && (!doc.links.bill || doc.links.bill.status === 'void'));

/** PUR-02 FR-3 — the statuses a supplier payment may be allocated to. */
const PAYABLE = new Set(['recorded', 'partially_paid', 'overdue']);

/**
 * PUR-01 FR-9 / PUR-04 FR-5 — `/purchases/bills/{id}`: header, lines with the
 * cost each put into stock, the totals, Pay supplier (PUR-02) and Void. A
 * voided bill says so in a banner with the reason, who and when (AC-3), and
 * keeps its number. The totals panel lists the supplier payments allocated to
 * the bill, each linked to its voucher (PUR-02 FR-6).
 *
 * Not here yet, each for a reason: the bill photo (no attachment wiring this
 * wave), Duplicate and Print (FR-9's `PurchaseBillPrint`) — no control for an
 * unbuilt feature.
 */
export function PurchaseBillDetailPageContent({
  id,
  kind = 'purchase_bill',
}: Readonly<{ id: string; kind?: PurchaseKind }>): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const detail = usePurchaseBillDetail(id, kind);
  const [voiding, setVoiding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [billing, setBilling] = useState(false);
  const [returning, setReturning] = useState(false);
  const bill = detail.bill?.id === id ? detail.bill : null;
  // Shop item 3 — the same page shows an order: Create bill and Cancel, no money owed.
  const order = kind === 'purchase_order';
  // Shop P0 — a debit note: against its bill, Void only, what it took off and what is left.
  const note = kind === 'debit_note';
  const home = order ? ROUTES.PURCHASE_ORDERS : ROUTES.PURCHASE_BILLS;
  const isBill = !order && !note;

  const createBill = async () => {
    if (!bill) return;
    setBilling(true);
    const result = await dispatch(movePurchaseOrder({ id: bill.id, verb: 'create-bill' }));
    setBilling(false);
    if (movePurchaseOrder.fulfilled.match(result)) {
      router.push(`${ROUTES.PURCHASE_BILLS}/${result.payload.bill.id}/edit`);
    }
  };

  if (!detail.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('purchases.noAccess.title')}
          description={t('purchases.noAccess.body')}
        />
      </UbPageShell>
    );
  }
  if (detail.status === 'failed' && !bill) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="error"
          title={t('purchases.detail.error.title')}
          description={detail.error?.message ?? t('purchases.detail.error.body')}
        />
      </UbPageShell>
    );
  }
  if (!bill) return <UbPageSkeleton variant="card" />;

  const draft = bill.status === 'draft';
  const row = (label: string, value: string) => (
    <UbInfoRow label={label} value={<UbText className="ds-num">{value}</UbText>} />
  );
  return (
    <UbPageShell>
      <UbPageHeader
        title={bill.number ?? t('purchases.status.draft')}
        subtitle={supplierName(bill)}
        controls={
          <UbStack direction="row">
            <UbStatusBadge
              tone={PURCHASE_STATUS_TONE[bill.status]}
              label={t(`purchases.status.${bill.status}`)}
            />
          </UbStack>
        }
        /* docs/mobile-redesign (A3) — on a phone these actions are a worded ⋯ sheet. */
        renderMobileActions={(actions) => (
          <UbPageHeaderMobileActions
            actions={actions}
            mobile={{
              menuLabel: t('common.action.moreActions'),
              closeLabel: t('common.action.close'),
            }}
          />
        )}
        actions={
          <>
            {draft && detail.canWrite && (
              <UbActionLink
                href={`${home}/${bill.id}/edit`}
                variant="secondary"
                iconOnly="mobile"
                icon={<Pencil className="h-4 w-4" aria-hidden />}
              >
                {t('purchases.detail.edit')}
              </UbActionLink>
            )}
            {/* PUR-02 FR-4 / AC-3 — a bill still owing takes a supplier payment
                from here, pre-allocated to THIS bill with its due as the
                amount. The bill re-reads itself on save (the invalidation map:
                `recordPayment` refetches `purchaseBillDetail`). */}
            {bill.party && PAYABLE.has(bill.status) && (
              <RecordPaymentButton
                context={{
                  direction: 'out',
                  partyId: bill.party.id,
                  partyName: supplierName(bill),
                  documentId: bill.id,
                  documentNumber: bill.number ?? undefined,
                  documentDue: bill.amountDue,
                  entry: 'bill',
                }}
              />
            )}
            {order && bill.status === 'sent' && detail.canWrite && (
              <UbButton
                variant="ghost"
                iconOnly="mobile"
                icon={<XCircle className="h-4 w-4" aria-hidden />}
                onClick={() => setCancelling(true)}
                data-testid="purchase-order-cancel"
              >
                {t('purchases.order.cancel.action')}
              </UbButton>
            )}
            {order && billable(bill) && detail.canWrite && (
              <UbButton
                iconOnly="mobile"
                icon={<FileOutput className="h-4 w-4" aria-hidden />}
                onClick={() => void createBill()}
                busy={billing}
                busyLabel={t('purchases.order.createBill.working')}
                data-testid="purchase-order-create-bill"
              >
                {t('purchases.order.createBill.action')}
              </UbButton>
            )}
            {isBill && VOIDABLE.has(bill.status) && detail.canWrite && (
              <UbButton
                variant="secondary"
                iconOnly="mobile"
                icon={<Undo2 className="h-4 w-4" aria-hidden />}
                onClick={() => setReturning(true)}
                data-testid="purchase-return"
              >
                {t('purchases.debitNote.open')}
              </UbButton>
            )}
            {note && bill.status === 'issued' && detail.canVoid && (
              <UbButton
                variant="secondary"
                iconOnly="mobile"
                icon={<Ban className="h-4 w-4" aria-hidden />}
                onClick={() => setCancelling(true)}
                data-testid="debit-note-void"
              >
                {t('purchases.debitNote.void.action')}
              </UbButton>
            )}
            {isBill && VOIDABLE.has(bill.status) && detail.canVoid && (
              <UbButton
                variant="secondary"
                iconOnly="mobile"
                icon={<Ban className="h-4 w-4" aria-hidden />}
                onClick={() => {
                  detail.clearVoidError();
                  setVoiding(true);
                }}
                data-testid="purchase-void"
              >
                {t('purchases.detail.void')}
              </UbButton>
            )}
          </>
        }
      />
      <UbStack gap={4}>
        {order && bill.status === 'cancelled' && (
          <UbStatusBanner
            tone="warning"
            title={t('purchases.order.cancelledBanner')}
            description={bill.links.cancelReason ?? undefined}
          />
        )}
        {order && bill.links.bill && (
          <UbStatusBanner
            tone={bill.links.bill.status === 'void' ? 'warning' : 'info'}
            title={t(
              bill.links.bill.status === 'void'
                ? 'purchases.order.billVoided'
                : 'purchases.order.billedAs',
              { number: bill.links.bill.number ?? t('purchases.status.draft') }
            )}
            action={
              <UbActionLink
                href={`${ROUTES.PURCHASE_BILLS}/${bill.links.bill.id}`}
                variant="secondary"
                size="sm"
              >
                {t('purchases.order.openBill')}
              </UbActionLink>
            }
          />
        )}
        {note && bill.links.against && (
          <UbStatusBanner
            tone="info"
            title={t('purchases.debitNote.against', {
              number: bill.links.against.number ?? '',
              reason: bill.links.reason ? t(`purchases.debitNote.reason.${bill.links.reason}`) : '',
            })}
            description={t(
              bill.links.restock
                ? 'purchases.debitNote.goodsLeft'
                : 'purchases.debitNote.noGoodsMoved'
            )}
            action={
              <UbActionLink
                href={`${ROUTES.PURCHASE_BILLS}/${bill.links.against.id}`}
                variant="secondary"
                size="sm"
              >
                {t('purchases.order.openBill')}
              </UbActionLink>
            }
          />
        )}
        {isBill && bill.links.order && (
          <UbText variant="body-sm">
            {t('purchases.order.fromOrder')}{' '}
            <UbLink href={`${ROUTES.PURCHASE_ORDERS}/${bill.links.order.id}`}>
              {bill.links.order.number ?? ''}
            </UbLink>
          </UbText>
        )}
        {bill.status === 'void' && (
          <UbStatusBanner
            tone="error"
            title={t('purchases.detail.voidBanner')}
            description={t('purchases.detail.voidBy', {
              reason: bill.voidReason ?? '',
              name: bill.voidedBy?.name ?? '—',
              when: bill.voidedAt ? formatTimestamp(bill.voidedAt) : '',
            })}
          />
        )}
        <UbGrid columns={{ base: 1, lg: 3 }} gap={4}>
          <UbStack gap={4} className="lg:col-span-2">
            <UbPanel>
              <UbStack gap={2} className="p-4">
                {row(
                  t(
                    order
                      ? 'purchases.order.date'
                      : note
                        ? 'purchases.debitNote.date'
                        : 'purchases.detail.billDate'
                  ),
                  formatBusinessDate(bill.documentDate)
                )}
                {!order &&
                  row(
                    t('purchases.detail.supplierInvoice'),
                    (note ? bill.links.supplierInvoiceNumber : bill.supplierInvoiceNumber) ?? '—'
                  )}
                {bill.supplierInvoiceDate &&
                  row(
                    t('purchases.detail.supplierInvoiceDate'),
                    formatBusinessDate(bill.supplierInvoiceDate)
                  )}
                {bill.dueOn &&
                  row(
                    t(order ? 'purchases.order.expectedBy' : 'purchases.detail.dueOn'),
                    formatBusinessDate(bill.dueOn)
                  )}
                {isBill &&
                  row(
                    t('purchases.detail.itc'),
                    bill.itcEligible ? t('purchases.detail.itcYes') : t('purchases.detail.itcNo')
                  )}
                {bill.notes && row(t('purchases.editor.notes'), bill.notes)}
              </UbStack>
            </UbPanel>
            <UbPanel>
              <UbStack gap={0} className="p-4" data-testid="purchase-lines">
                {bill.lines.map((line, index) => (
                  <UbStack key={line.id ?? line.lineNo} gap={2}>
                    {index > 0 && <UbDivider />}
                    <UbStack direction="row" justify="between" align="start" className="gap-3 py-2">
                      <UbStack gap={0} className="min-w-0 flex-1">
                        <UbText variant="body" className="line-clamp-2">
                          {line.description}
                        </UbText>
                        <UbText variant="caption" tone="tertiary" className="ds-num">
                          {t('purchases.detail.lineCaption', {
                            qty: trimQty(line.qty),
                            unit: line.unitCode,
                            cost: formatInr(line.unitCost),
                            // QA retest P-D6: the zero-rate codes read as words in the
                            // reader's language; a rate reads "GST 5%", never "GST5".
                            code: taxRateLabel(
                              { code: line.taxCode, name: `GST ${Number(line.taxRate)}%` },
                              t
                            ),
                          })}
                        </UbText>
                        {line.inboundUnitCost && line.trackStock && (
                          <UbText variant="caption" tone="tertiary" className="ds-num">
                            {t('purchases.detail.stockCost', {
                              cost: formatInr(line.inboundUnitCost),
                            })}
                          </UbText>
                        )}
                      </UbStack>
                      <UbAmount value={line.lineTotal} size="sm" />
                    </UbStack>
                  </UbStack>
                ))}
              </UbStack>
            </UbPanel>
          </UbStack>
          <UbPanel as="aside" className="lg:sticky lg:top-4">
            <UbStack gap={2} className="p-4">
              {row(t('purchases.totals.subtotal'), formatInr(bill.subtotal))}
              {bill.discountAmount !== '0.00' &&
                row(t('purchases.totals.discount'), `−${formatInr(bill.discountAmount)}`)}
              {row(t('purchases.totals.taxable'), formatInr(bill.taxableTotal))}
              {bill.igstTotal !== '0.00' ? (
                row(t('purchases.tax.igst'), formatInr(bill.igstTotal))
              ) : (
                <>
                  {row(t('purchases.tax.cgst'), formatInr(bill.cgstTotal))}
                  {row(t('purchases.tax.sgst'), formatInr(bill.sgstTotal))}
                </>
              )}
              {row(t('purchases.totals.roundOffShort'), formatInr(bill.roundOff))}
              <UbDivider />
              {row(
                t(
                  order
                    ? 'purchases.order.estimatedTotal'
                    : note
                      ? 'purchases.debitNote.total'
                      : 'purchases.totals.grand'
                ),
                formatInr(bill.grandTotal)
              )}
              {note && bill.status === 'issued' && (
                <>
                  {row(t('purchases.debitNote.applied'), formatInr(bill.links.applied))}
                  {row(t('purchases.debitNote.openCredit'), formatInr(bill.amountDue))}
                </>
              )}
              {isBill &&
                bill.links.debitApplied !== '0.00' &&
                row(t('purchases.debitNote.lessNotes'), `−${formatInr(bill.links.debitApplied)}`)}
              {!draft &&
                isBill &&
                bill.status !== 'void' &&
                bill.amountPaid !== '0.00' &&
                row(t('purchases.detail.paid'), formatInr(bill.amountPaid))}
              {!draft &&
                isBill &&
                bill.status !== 'void' &&
                row(t('purchases.total.toPay'), formatInr(bill.amountDue))}
              {bill.links.debitNotes.length > 0 && (
                <UbStack gap={1} className="pt-2" data-testid="purchase-debit-notes">
                  <UbText variant="body-sm-medium">{t('purchases.debitNote.listTitle')}</UbText>
                  {bill.links.debitNotes.map((dn) => (
                    <UbText key={dn.id} variant="caption" tone="secondary" className="ds-num">
                      <UbLink href={`${ROUTES.DEBIT_NOTES}/${dn.id}`}>{dn.number ?? ''}</UbLink>
                      {` · ${formatBusinessDate(dn.documentDate)} · ${formatInr(dn.grandTotal)}`}
                      {dn.status === 'void' ? ` · ${t('purchases.status.void')}` : ''}
                    </UbText>
                  ))}
                </UbStack>
              )}
              {bill.payments.length > 0 && (
                <UbStack gap={1} className="pt-2" data-testid="purchase-payments">
                  <UbText variant="body-sm-medium">{t('purchases.detail.payments')}</UbText>
                  {bill.payments.map((payment) => (
                    <UbText key={payment.id} variant="caption" tone="secondary" className="ds-num">
                      <UbLink href={`${ROUTES.PAYMENTS}/${payment.id}`}>{payment.number}</UbLink>
                      {` · ${formatBusinessDate(payment.paymentDate)} · ${formatInr(payment.amount)}`}
                    </UbText>
                  ))}
                </UbStack>
              )}
            </UbStack>
          </UbPanel>
        </UbGrid>
      </UbStack>
      {cancelling && (
        <OrderCancelDialogLazy
          order={bill}
          mode={note ? 'voidNote' : 'cancelOrder'}
          onClose={() => setCancelling(false)}
        />
      )}
      {returning && <DebitNoteDrawerLazy bill={bill} onClose={() => setReturning(false)} />}
      {voiding && (
        <VoidDialogLazy
          bill={bill}
          busy={detail.voiding}
          error={detail.voidError}
          onClose={() => setVoiding(false)}
          onConfirm={(reason) => {
            void detail.voidBill(reason).then((ok) => {
              if (ok) setVoiding(false);
            });
          }}
        />
      )}
    </UbPageShell>
  );
}
