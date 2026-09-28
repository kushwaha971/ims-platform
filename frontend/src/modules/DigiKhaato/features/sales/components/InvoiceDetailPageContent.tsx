'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

import { Link2, MessageCircle, Pencil, Printer, ReceiptText } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbEmptyState,
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

import { useInvoiceDetail } from '../hooks/useInvoiceDetail';
import { STATUS_TONE, partyLabel } from '../view-model/invoiceDisplay';

/* The print layouts load with the bill, not with the list or the editor. */
const PrintSheetLazy = dynamic(
  () => import('./print/InvoicePrintSheet').then((m) => m.InvoicePrintSheet),
  { ssr: false, loading: () => <UbPageSkeleton variant="card" /> }
);

/**
 * SAL-03 — `/sales/invoices/{id}`: the bill as it will print (A4 preview, or
 * the 80 mm slip), with Print A4 / Print 80 mm / Copy link / WhatsApp. The
 * page chrome carries `ub-print-hide`, so paper gets only the sheet. `?print=1`
 * (from the success sheet) opens the print dialog on arrival (SAL-03 US-1).
 */
export function InvoiceDetailPageContent({ id }: Readonly<{ id: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const search = useSearchParams();
  const locale = useAppSelector(selectLocale);
  const { can, hasModule } = usePermissions();
  const detail = useInvoiceDetail(id, search?.get('print') === '1');
  const doc = detail.document?.id === id ? detail.document : null;

  if (!(hasModule('sales') && can('sales.invoice.read'))) {
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
            {draft && can('sales.invoice.write') && (
              <UbActionLink
                href={`${ROUTES.SALES_INVOICES}/${doc.id}/edit`}
                variant="secondary"
                iconOnly="mobile"
                icon={<Pencil className="h-4 w-4" aria-hidden />}
              >
                {t('sales.detail.edit')}
              </UbActionLink>
            )}
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
          <UbStack gap={2} className="p-4">
            <UbText variant="body-sm">
              {t('sales.detail.summary', {
                date: formatBusinessDate(doc.documentDate),
                total: formatInr(doc.grandTotal),
                due: formatInr(doc.amountDue),
              })}
            </UbText>
            {!draft && (
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
            {detail.shareLink && (
              <UbText variant="caption" tone="tertiary">
                {t('sales.share.validUntil', {
                  date: formatBusinessDate(detail.shareLink.expiresAt.slice(0, 10)),
                })}
              </UbText>
            )}
          </UbStack>
        </UbPanel>
        <UbStack className="overflow-x-auto rounded-card border border-border-hairline bg-white print:overflow-visible print:rounded-none print:border-0">
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
