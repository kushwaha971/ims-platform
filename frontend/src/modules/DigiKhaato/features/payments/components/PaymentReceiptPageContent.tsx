'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

import { Ban, Copy, MessageCircle, Printer, RotateCcw } from 'lucide-react';

import {
  UbButton,
  UbEmptyState,
  UbInfoRow,
  UbLink,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPanel,
  UbShareSheet,
  UbStack,
  UbStatusBadge,
  UbStatusBanner,
  type UbShareSheetLabels,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useShareFeedback } from 'src/hooks/useShareFeedback';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectLocale } from 'src/redux/slice/localeSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { partyPath } from 'src/routes';
import { copyText } from 'src/utils/clipboard';
import { formatBusinessDate, formatTimestamp } from 'src/utils/dates';
import { formatAmount } from 'src/utils/money';

import { usePaymentReceipt } from '../hooks/usePaymentReceipt';
import { allocationHref } from '../view-model/allocationLinks';

import type { PaymentContext } from '../types/payment.types';

/* The print sheet, the void dialog and the drawer load with the receipt or the tap. */
const ReceiptPrintLazy = dynamic(
  () => import('./print/PaymentReceiptPrint').then((m) => m.PaymentReceiptPrint),
  { ssr: false, loading: () => <UbPageSkeleton variant="card" /> }
);
const VoidDialogLazy = dynamic(
  () => import('./VoidPaymentDialog').then((m) => m.VoidPaymentDialog),
  { ssr: false }
);
const PaymentFormDrawerLazy = dynamic(
  () => import('./PaymentFormDrawer').then((m) => m.PaymentFormDrawer),
  { ssr: false }
);

/**
 * PAY-04 / PAY-05 — `/payments/{id}`: the receipt as it will print (A5), with
 * Print, Share on WhatsApp and — for an owner or admin — Void. A voided receipt
 * stays here with its reason and a Void badge, and offers "Record again"
 * (FR-7), which opens the drawer with the same party, lines and amount.
 * `?print=1` opens the print dialog on arrival, the way the invoice does.
 */
export function PaymentReceiptPageContent({ id }: Readonly<{ id: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const search = useSearchParams();
  const locale = useAppSelector(selectLocale);
  const { can, hasModule } = usePermissions();
  const receipt = usePaymentReceipt(id, search?.get('print') === '1');
  const feedback = useShareFeedback();
  const voidButton = useRef<HTMLButtonElement | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [again, setAgain] = useState<PaymentContext | null>(null);
  const payment = receipt.payment?.id === id ? receipt.payment : null;

  const labels = useMemo<UbShareSheetLabels>(
    () => ({
      whatsapp: t('share.whatsapp'),
      sms: t('share.sms'),
      copy: t('share.copyText'),
      more: t('share.more'),
      close: t('common.action.close'),
      preview: t('share.preview'),
    }),
    [t]
  );

  const { startShare, submitVoid } = receipt;
  const openShare = useCallback(async () => {
    if (await startShare()) setSharing(true);
  }, [startShare]);
  const confirmVoid = useCallback(
    async (reason: string) => {
      if (await submitVoid(reason)) setVoiding(false);
    },
    [submitVoid]
  );
  const askOwner = useCallback(async () => {
    if (!payment) return;
    const copied = await copyText(
      t('payments.void.askOwnerText', {
        number: payment.number,
        amount: formatAmount(payment.amount),
      })
    );
    dispatch(
      showSnackbar({
        severity: copied ? 'success' : 'error',
        id: copied ? 'share.copied' : 'share.copyFailed',
      })
    );
  }, [dispatch, payment, t]);

  if (!(hasModule('payments') && can('payments.payment.read'))) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('payments.noAccess.title')}
          description={t('payments.noAccess.body')}
        />
      </UbPageShell>
    );
  }
  if (receipt.status === 'failed') {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="error"
          title={t('payments.receipt.error.title')}
          description={receipt.error?.message ?? t('payments.receipt.error.body')}
        />
      </UbPageShell>
    );
  }
  if (!payment) return <UbPageSkeleton variant="card" />;

  const isVoid = payment.status === 'void';
  const canRecord = hasModule('payments') && can('payments.payment.write');
  return (
    <UbPageShell>
      <UbPageHeader
        className="ub-print-hide"
        title={payment.number}
        subtitle={payment.party?.name ?? t('payments.walkIn')}
        controls={
          <UbStack direction="row">
            {isVoid ? (
              <UbStatusBadge tone="neutral" label={t('payments.status.void')} />
            ) : (
              <UbStatusBadge
                tone={payment.direction === 'in' ? 'success' : 'info'}
                label={t(`payments.direction.${payment.direction}`)}
              />
            )}
          </UbStack>
        }
        actions={
          <>
            {!isVoid && receipt.canShare && (
              <UbButton
                variant="secondary"
                iconOnly="mobile"
                icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                busy={receipt.shareStatus === 'loading'}
                onClick={() => void openShare()}
              >
                {t('payments.receipt.share')}
              </UbButton>
            )}
            {!isVoid && receipt.canVoid && (
              <UbButton
                ref={voidButton}
                variant="secondary"
                iconOnly="mobile"
                icon={<Ban className="h-4 w-4" aria-hidden />}
                onClick={() => setVoiding(true)}
                data-testid="payment-void"
              >
                {t('payments.void.action')}
              </UbButton>
            )}
            {!isVoid && !receipt.canVoid && receipt.canShare && (
              <UbButton
                variant="ghost"
                iconOnly="mobile"
                icon={<Copy className="h-4 w-4" aria-hidden />}
                onClick={() => void askOwner()}
              >
                {t('payments.void.askOwner')}
              </UbButton>
            )}
            {isVoid && canRecord && payment.party && (
              <UbButton
                variant="secondary"
                iconOnly="mobile"
                icon={<RotateCcw className="h-4 w-4" aria-hidden />}
                onClick={() =>
                  setAgain({
                    direction: payment.direction,
                    partyId: payment.party?.id,
                    partyName: payment.party?.name,
                    presetLines: payment.modeBreakup,
                    entry: 'again',
                  })
                }
              >
                {t('payments.void.recordAgain')}
              </UbButton>
            )}
            <UbButton
              iconOnly="mobile"
              icon={<Printer className="h-4 w-4" aria-hidden />}
              onClick={receipt.print}
              data-testid="payment-print"
            >
              {t('payments.receipt.print')}
            </UbButton>
          </>
        }
      />
      <UbStack gap={4}>
        {isVoid && (
          <UbStatusBanner
            className="ub-print-hide"
            tone="warning"
            title={t('payments.void.banner', {
              name: payment.voidedBy?.name ?? '',
              when: formatTimestamp(payment.voidedAt),
            })}
            description={payment.voidReason ?? undefined}
          />
        )}
        <UbPanel className="ub-print-hide">
          {/* 8 px between rows: the party and "against" values are links, and
              stacked flush they were 14 px targets 16 px apart — under WCAG
              2.5.8's 24 px spacing floor (axe target-size, Sprint 12 sweep). */}
          <UbStack gap={2} className="p-4">
            <UbInfoRow label={t('payments.date')} value={formatBusinessDate(payment.paymentDate)} />
            {payment.party && (
              <UbInfoRow
                label={t(payment.direction === 'in' ? 'payments.party.from' : 'payments.party.to')}
                value={<UbLink href={partyPath(payment.party.id)}>{payment.party.name}</UbLink>}
              />
            )}
            {payment.allocations.map((row) => (
              <UbInfoRow
                key={row.documentId}
                label={t('payments.receipt.against')}
                value={
                  <UbLink href={allocationHref(row)}>
                    {`${row.number ?? '—'} · ${formatAmount(row.amount)}`}
                  </UbLink>
                }
              />
            ))}
            {payment.note && <UbInfoRow label={t('payments.note')} value={payment.note} />}
            {payment.createdBy?.name && (
              <UbInfoRow label={t('payments.recordedBy')} value={payment.createdBy.name} />
            )}
          </UbStack>
        </UbPanel>
        {/* A region that scrolls sideways on a phone must be reachable by
            keyboard, and named, or its right half is unreadable without a
            pointer (axe scrollable-region-focusable, Sprint 12 sweep). */}
        <UbStack
          role="region"
          aria-label={t('payments.receipt.preview')}
          tabIndex={0}
          className="overflow-x-auto rounded-card border border-border-hairline bg-white print:overflow-visible print:rounded-none print:border-0"
        >
          <ReceiptPrintLazy
            payment={payment}
            branding={receipt.branding}
            staticQr={receipt.staticQr}
            locale={locale}
            t={t}
          />
        </UbStack>
      </UbStack>

      {voiding && (
        <VoidDialogLazy
          payment={payment}
          busy={receipt.voidStatus === 'loading'}
          errors={receipt.voidErrors}
          onClose={() => setVoiding(false)}
          onConfirm={(reason) => void confirmVoid(reason)}
          returnFocusRef={voidButton}
        />
      )}
      {sharing && receipt.shareText && (
        <UbShareSheet
          open
          onOpenChange={(next) => !next && setSharing(false)}
          title={t('payments.receipt.share')}
          description={payment.party?.name}
          message={receipt.shareText}
          phone={receipt.shareMobile}
          labels={labels}
          onShared={feedback.onShared}
          onFailed={feedback.onFailed}
        />
      )}
      {again && <PaymentFormDrawerLazy context={again} onClose={() => setAgain(null)} />}
    </UbPageShell>
  );
}
