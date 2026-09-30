'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

import { Link2, MessageCircle, Pencil, Printer, ReceiptText, RotateCcw } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbEmptyState,
  UbLink,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPanel,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectLocale } from 'src/redux/slice/localeSlice';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { RecordPaymentButton } from '../../payments/components/RecordPaymentButton';
import { useInvoiceDetail } from '../hooks/useInvoiceDetail';
import { STATUS_TONE, partyLabel } from '../view-model/invoiceDisplay';

import { DocumentActions } from './DocumentActions';
import { DocumentLinksPanel } from './DocumentLinksPanel';
import { OriginBadge } from './OriginBadge';

import type { FlowKind } from '../types/salesFlows.types';

/* The print layouts load with the bill, not with the list or the editor. */
const PrintSheetLazy = dynamic(
  () => import('./print/InvoicePrintSheet').then((m) => m.InvoicePrintSheet),
  { ssr: false, loading: () => <UbPageSkeleton variant="card" /> }
);

type DetailKind = 'invoice' | FlowKind;

/** What reading each kind needs (SAL-01 §12: estimates have their own read codename). */
const READ_PERMISSION = {
  invoice: 'sales.invoice.read',
  estimate: 'sales.estimate.read',
  credit_note: 'sales.invoice.read',
} as const;

/**
 * SAL-03 — `/sales/invoices/{id}`: the bill as it will print (A4 preview, or
 * the 80 mm slip), with Print A4 / Print 80 mm / Copy link / WhatsApp. The
 * page chrome carries `ub-print-hide`, so paper gets only the sheet. `?print=1`
 * (from the success sheet) opens the print dialog on arrival (SAL-03 US-1).
 *
 * The same page is `/sales/estimates/{id}` and `/sales/credit-notes/{id}`
 * (SAL-01 FR-9, SAL-04 FR-11 reuse the print components): `kind` picks the
 * read, the title on paper and the actions — estimate moves and convert, a
 * bill's return and void, a note's apply and void (`DocumentActions`).
 */
export function InvoiceDetailPageContent({
  id,
  kind = 'invoice',
}: Readonly<{ id: string; kind?: DetailKind }>): React.JSX.Element {
  const { t } = useTranslation();
  const search = useSearchParams();
  const locale = useAppSelector(selectLocale);
  const { can, hasModule } = usePermissions();
  const detail = useInvoiceDetail(id, search?.get('print') === '1', kind);
  const doc = detail.document?.id === id ? detail.document : null;

  if (!(hasModule('sales') && can(READ_PERMISSION[kind]))) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('sales.noAccess.title')}
          description={t('sales.noAccess.body')}
        />
      </UbPageShell>
    );
  }
  if (detail.status === 'failed') {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="error"
          title={t('sales.detail.error.title')}
          description={detail.error?.message ?? t('sales.detail.error.body')}
        />
      </UbPageShell>
    );
  }
  if (!doc) return <UbPageSkeleton variant="card" />;

  const draft = doc.status === 'draft';
  const invoice = kind === 'invoice';
  return (
    <UbPageShell>
      <UbPageHeader
        className="ub-print-hide"
        title={doc.number ?? t('sales.status.draft')}
        subtitle={partyLabel(doc) ?? t('sales.walkIn.customer')}
        controls={
          // The controls row is full-width; the badge sizes to its label.
          <UbStack direction="row">
            <UbStatusBadge tone={STATUS_TONE[doc.status]} label={t(`sales.status.${doc.status}`)} />
          </UbStack>
        }
        actions={
          <>
            {invoice && draft && can('sales.invoice.write') && (
              <UbActionLink
                href={`${ROUTES.SALES_INVOICES}/${doc.id}/edit`}
                variant="secondary"
                iconOnly="mobile"
                icon={<Pencil className="h-4 w-4" aria-hidden />}
              >
                {t('sales.detail.edit')}
              </UbActionLink>
            )}
            {/* PAY-01 FR-1 — a party bill still owing takes a payment from here,
                allocated to THIS bill first; the page re-reads it on save. */}
            {invoice &&
              doc.party &&
              ['issued', 'partially_paid', 'overdue'].includes(doc.status) && (
                <RecordPaymentButton
                  context={{
                    direction: 'in',
                    partyId: doc.party.id,
                    partyName: doc.partySnapshot?.name || doc.party.name,
                    documentId: doc.id,
                    documentNumber: doc.number ?? undefined,
                    documentDue: doc.amountDue,
                    entry: 'invoice',
                  }}
                  onSaved={detail.reload}
                />
              )}
            <DocumentActions doc={doc} />
            <UbButton
              variant="secondary"
              iconOnly="mobile"
              icon={<ReceiptText className="h-4 w-4" aria-hidden />}
              onClick={() => detail.print('thermal80')}
              data-testid="print-thermal-action"
            >
              {t('sales.print.thermal')}
            </UbButton>
            <UbButton
              iconOnly="mobile"
              icon={<Printer className="h-4 w-4" aria-hidden />}
              onClick={() => detail.print('a4')}
              data-testid="print-a4-action"
            >
              {t('sales.print.a4')}
            </UbButton>
          </>
        }
      />
      <UbStack gap={4}>
        <UbPanel className="ub-print-hide">
          <UbStack gap={3} className="p-4">
            <UbText variant="body-sm">
              {t(invoice ? 'sales.detail.summary' : 'sales.detail.summaryTotal', {
                date: formatBusinessDate(doc.documentDate),
                total: formatInr(doc.grandTotal),
                due: formatInr(doc.amountDue),
              })}
            </UbText>
            {doc.origin && <OriginBadge origin={doc.origin} />}
            <DocumentLinksPanel doc={doc} />
            {!draft && doc.status !== 'void' && (
              <UbStack direction="row" gap={2} className="flex-wrap">
                <UbButton
                  variant="secondary"
                  size="sm"
                  icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                  busy={detail.sharing}
                  onClick={() => void detail.share('whatsapp')}
                >
                  {t('sales.share.whatsapp')}
                </UbButton>
                <UbButton
                  variant="secondary"
                  size="sm"
                  icon={<Link2 className="h-4 w-4" aria-hidden />}
                  onClick={() => void detail.share('link')}
                >
                  {t('sales.share.copyLink')}
                </UbButton>
              </UbStack>
            )}
            {doc.payments.length > 0 && (
              <UbStack gap={1} data-testid="invoice-payments">
                {doc.payments.map((row) => (
                  <UbText key={row.id} variant="caption" tone="secondary">
                    <UbLink href={`${ROUTES.PAYMENTS}/${row.id}`}>{row.number}</UbLink>
                    {` · ${formatBusinessDate(row.paymentDate)} · ${formatInr(row.amount)}`}
                    {row.status === 'void' ? ` · ${t('payments.status.void')}` : ''}
                  </UbText>
                ))}
              </UbStack>
            )}
            {detail.shareLink && (
              <UbStack direction="row" gap={2} className="flex-wrap items-center">
                <UbText variant="caption" tone="tertiary">
                  {t('sales.share.validUntil', {
                    date: formatBusinessDate(detail.shareLink.expiresAt.slice(0, 10)),
                  })}
                </UbText>
                {/* UAT D1 — sharing again reuses the live link; rotating it is an
                    explicit owner/admin act (the revoke permission), never a side
                    effect of tapping Copy link. */}
                {can('sales.invoice.void') && (
                  <UbButton
                    variant="ghost"
                    size="sm"
                    icon={<RotateCcw className="h-4 w-4" aria-hidden />}
                    busy={detail.sharing}
                    onClick={() => void detail.resetLink()}
                  >
                    {t('sales.share.reset')}
                  </UbButton>
                )}
              </UbStack>
            )}
          </UbStack>
        </UbPanel>
        {/* A region that scrolls sideways on a phone must be reachable by
            keyboard, and named, or its right half is unreadable without a
            pointer (axe scrollable-region-focusable, Sprint 12 sweep). */}
        <UbStack
          role="region"
          aria-label={t('sales.print.preview')}
          tabIndex={0}
          className="overflow-x-auto rounded-card border border-border-hairline bg-white print:overflow-visible print:rounded-none print:border-0"
        >
          <PrintSheetLazy
            doc={doc}
            upi={detail.upi}
            branding={detail.branding}
            locale={locale}
            template={detail.template}
          />
        </UbStack>
      </UbStack>
    </UbPageShell>
  );
}
