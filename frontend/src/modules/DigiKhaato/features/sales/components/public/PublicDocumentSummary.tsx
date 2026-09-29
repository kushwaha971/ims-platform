'use client';

import { Printer } from 'lucide-react';

import {
  UbActionLink,
  UbAvatar,
  UbButton,
  UbCard,
  UbDivider,
  UbImagePreview,
  UbQrCode,
  UbStack,
  UbStatusBadge,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { documentTitleId } from '../../view-model/invoiceDisplay';
import {
  headlineAmount,
  isPayableKind,
  kindNoteId,
  publicStatus,
} from '../../view-model/publicDocumentView';

import type { PublicDocument } from '../../types/publicDocument.types';
import type { SalesAddress } from '../../types/sales.types';

const addressLine = (a: SalesAddress): string =>
  [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');

/**
 * SAL-03 FR-5 — the top of the customer's page, the part a phone shows before
 * any scrolling: who sent it (the shop's letterhead), what it is, the one
 * figure that matters, and — while money is owed and the shop has a UPI ID —
 * "Pay ₹X", which is a `upi://pay` link the phone hands to GPay/PhonePe/Paytm.
 * The QR is for the customer who opened the link on a laptop; a phone cannot
 * scan its own screen, so it is not drawn below `sm`.
 *
 * Nothing here links into the app: the customer has no account in it.
 */
export function PublicDocumentSummary({
  data,
  onPrint,
  t,
}: Readonly<{ data: PublicDocument; onPrint: () => void; t: TranslateFn }>): React.JSX.Element {
  const { document: doc, branding, upi } = data;
  const supplier = doc.supplier;
  const shopName = supplier.legalName || supplier.name;
  const status = publicStatus(doc);
  const headline = headlineAmount(doc);
  const note = kindNoteId(doc);
  const address = addressLine(supplier.address);
  const party = doc.partySnapshot?.name || doc.walkInName;
  const payable = upi !== null && doc.status !== 'void' && isPayableKind(doc);
  const received = doc.payments.filter((row) => row.status !== 'void');

  return (
    <UbCard className="ub-print-hide">
      <UbStack gap={4}>
        <UbStack as="header" direction="row" gap={3} align="start" data-testid="public-shop">
          {branding.logoUrl ? (
            <UbImagePreview src={branding.logoUrl} alt={shopName} emptyLabel={shopName} size="sm" />
          ) : (
            <UbAvatar name={shopName} />
          )}
          <UbStack gap={0.5} className="min-w-0">
            <UbText as="h1" variant="h3" className="break-words">
              {shopName}
            </UbText>
            {address && (
              <UbText variant="caption" tone="tertiary" className="break-words">
                {address}
              </UbText>
            )}
            {supplier.gstin && (
              <UbText variant="caption" tone="tertiary" className="font-mono">
                {t('publicDocument.gstin', { gstin: supplier.gstin })}
              </UbText>
            )}
          </UbStack>
        </UbStack>

        <UbDivider />

        <UbStack gap={2}>
          <UbStack direction="row" justify="between" align="start" gap={3} wrap>
            <UbStack gap={0.5} className="min-w-0">
              <UbText as="h2" variant="body-medium" data-testid="public-title">
                {t(documentTitleId(doc.kind, supplier.gstType))}
                {doc.number ? ` · ${doc.number}` : ''}
              </UbText>
              <UbText variant="caption" tone="tertiary">
                {t('publicDocument.dated', { date: formatBusinessDate(doc.documentDate) })}
                {doc.dueOn && isPayableKind(doc) && doc.status !== 'paid' && doc.status !== 'void'
                  ? ` · ${t('publicDocument.dueBy', { date: formatBusinessDate(doc.dueOn) })}`
                  : ''}
                {doc.kind === 'estimate' && doc.validUntil
                  ? ` · ${t('publicDocument.validUntil', { date: formatBusinessDate(doc.validUntil) })}`
                  : ''}
              </UbText>
              {party && (
                <UbText variant="caption" tone="tertiary" className="break-words">
                  {t('publicDocument.billedTo', { name: party })}
                </UbText>
              )}
            </UbStack>
            <UbStack data-testid="public-status">
              <UbStatusBadge label={t(status.labelId)} tone={status.tone} />
            </UbStack>
          </UbStack>

          <UbStack gap={0.5} data-testid="public-headline">
            <UbText variant="caption" tone="tertiary">
              {t(headline.labelId)}
            </UbText>
            <UbText variant="metric-md" data-testid="public-amount">
              {formatInr(headline.value)}
            </UbText>
            {doc.kind !== 'estimate' &&
              doc.kind !== 'credit_note' &&
              headline.value !== doc.grandTotal && (
                <UbText variant="caption" tone="tertiary">
                  {t('publicDocument.ofTotal', { total: formatInr(doc.grandTotal) })}
                </UbText>
              )}
          </UbStack>
        </UbStack>

        {note &&
          (doc.status === 'void' ? (
            <UbStatusBanner tone="warning" title={t(note)} />
          ) : (
            <UbText variant="body-sm" tone="secondary">
              {t(note)}
            </UbText>
          ))}

        {payable && upi && (
          <UbStack gap={3} data-testid="public-pay-block">
            <UbActionLink
              href={upi.upiUrl}
              variant="primary"
              size="lg"
              className="w-full sm:w-auto sm:self-start"
              data-testid="public-pay"
            >
              {t('publicDocument.pay', { amount: formatInr(upi.amount ?? doc.amountDue) })}
            </UbActionLink>
            {/* "on this phone" is only true on a phone; a laptop gets the QR. */}
            <UbText variant="caption" tone="tertiary" align="center" className="sm:hidden">
              {t('publicDocument.payHint')}
            </UbText>
            <UbStack direction="row" gap={4} align="center" className="hidden sm:flex">
              <UbQrCode modules={upi.qr.modules} size="136px" label={t('publicDocument.scan')} />
              <UbStack gap={1} className="min-w-0">
                <UbText variant="body-sm-medium">{t('publicDocument.scan')}</UbText>
                {supplier.upiVpa && (
                  <UbText variant="caption" tone="tertiary" className="break-all font-mono">
                    {supplier.upiVpa}
                  </UbText>
                )}
              </UbStack>
            </UbStack>
          </UbStack>
        )}

        {received.length > 0 && (
          <UbStack gap={1} data-testid="public-payments">
            <UbText variant="body-sm-medium">{t('publicDocument.payments.title')}</UbText>
            {received.map((row) => (
              <UbText key={`${row.number}-${row.paymentDate}`} variant="caption" tone="secondary">
                {t('publicDocument.payments.row', {
                  date: formatBusinessDate(row.paymentDate),
                  mode: t(`ledger.mode.${row.primaryMode}`),
                  amount: formatInr(row.amount),
                })}
              </UbText>
            ))}
          </UbStack>
        )}

        <UbButton
          variant="outlineNeutral"
          icon={<Printer aria-hidden className="h-4 w-4" />}
          onClick={onPrint}
          className="self-start"
          data-testid="public-print"
        >
          {t('publicDocument.print')}
        </UbButton>
      </UbStack>
    </UbCard>
  );
}
