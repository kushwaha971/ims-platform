'use client';

import { Send } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbDivider,
  UbEmptyState,
  UbForm,
  UbGrid,
  UbInfoRow,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPanel,
  UbStack,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr, sumMoney } from 'src/utils/money';

import { useCreditNoteEditor } from '../hooks/useCreditNoteEditor';
import { stockBackText } from '../view-model/creditNoteForm';

import { CreditNoteLinesSection } from './CreditNoteLinesSection';
import { CreditNoteSettlement } from './CreditNoteSettlement';

/**
 * SAL-04 §6 — `/sales/credit-notes/new?against=<invoice>`: "Return items" from
 * a bill. The lines are the bill's, priced as they were billed; the merchant
 * enters what came back, why, whether it goes back on the shelf, and what
 * happens to the credit. Before the tap it says what will happen (§8): "Stock
 * +3 Cooking Oil · ₹465.81 off INV/…'s due · ₹0 held as advance".
 *
 * A standalone note (no bill) is served by the API (FR-3) and not offered
 * here: every return a counter makes starts from the bill it returns.
 */
export function CreditNoteEditorPageContent({
  againstId,
}: Readonly<{ againstId: string | null }>): React.JSX.Element {
  const { t } = useTranslation();
  const editor = useCreditNoteEditor(againstId);
  const { state, form, values, preview, split, overCap, today, canWrite, issue } = editor;
  const invoice = state.source?.id === againstId ? state.source : null;

  if (!canWrite) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('sales.noAccess.title')}
          description={t('sales.noAccess.writeBody')}
        />
      </UbPageShell>
    );
  }
  if (!againstId || state.loadStatus === 'failed') {
    return (
      <UbPageShell>
        <UbEmptyState
          variant={againstId ? 'error' : 'firstUse'}
          title={t('sales.creditNote.empty.first')}
          description={t('sales.creditNote.empty.firstBody')}
          action={
            <UbActionLink href={ROUTES.SALES_INVOICES} variant="secondary">
              {t('sales.list.title')}
            </UbActionLink>
          }
        />
      </UbPageShell>
    );
  }
  if (!invoice || !values?.lines) return <UbPageSkeleton variant="card" />;

  const nothing = !preview || preview.lines.length === 0;
  const stock = values.restock ? stockBackText(invoice, values) : '';
  const party = invoice.partySnapshot?.name ?? invoice.party?.name ?? '';
  return (
    <UbPageShell>
      <UbPageHeader
        title={t('sales.creditNote.newTitle', { number: invoice.number ?? '' })}
        subtitle={party}
        actions={
          <UbButton
            iconOnly="mobile"
            icon={<Send className="h-4 w-4" aria-hidden />}
            onClick={() => void issue()}
            busy={state.issuing}
            busyLabel={t('sales.creditNote.issuing')}
            disabled={nothing || overCap || state.issuing}
            data-testid="credit-note-issue"
          >
            {t('sales.creditNote.issue')}
          </UbButton>
        }
      />
      <UbForm form={form} onSubmit={() => void issue()}>
        <UbGrid columns={{ base: 1, lg: 3 }} gap={4}>
          <UbStack gap={4} className="lg:col-span-2">
            <UbText variant="body-sm" tone="tertiary">
              {t('sales.creditNote.invoiceSummary', {
                number: invoice.number ?? '',
                date: formatBusinessDate(invoice.documentDate),
                total: formatInr(invoice.grandTotal),
                due: formatInr(invoice.amountDue),
              })}
            </UbText>
            <CreditNoteLinesSection invoice={invoice} disabled={state.issuing} />
            <CreditNoteSettlement
              form={form}
              invoice={invoice}
              today={today}
              left={split?.left ?? '0.00'}
              disabled={state.issuing}
            />
          </UbStack>
          <UbPanel as="aside" className="lg:sticky lg:top-4">
            <UbStack gap={3} className="p-4" data-testid="credit-note-totals">
              <UbInfoRow
                label={t('sales.totals.taxable')}
                value={formatInr(preview?.taxableTotal ?? '0.00')}
              />
              <UbInfoRow
                label={t('sales.creditNote.tax')}
                value={formatInr(
                  preview
                    ? sumMoney([
                        preview.cgstTotal,
                        preview.sgstTotal,
                        preview.igstTotal,
                        preview.cessTotal,
                      ])
                    : '0.00'
                )}
              />
              <UbDivider />
              <UbInfoRow
                label={t('sales.creditNote.total')}
                value={formatInr(preview?.grandTotal ?? '0.00')}
                variant="total"
              />
              <UbStack gap={1} data-testid="credit-note-consequence">
                {stock && (
                  <UbText variant="caption" tone="tertiary">
                    {t('sales.creditNote.consequence.stock', { items: stock })}
                  </UbText>
                )}
                {split && split.applied !== '0.00' && (
                  <UbText variant="caption" tone="tertiary">
                    {t('sales.creditNote.consequence.applied', {
                      amount: formatInr(split.applied),
                      number: invoice.number ?? '',
                    })}
                  </UbText>
                )}
                {split && split.left !== '0.00' && (
                  <UbText variant="caption" tone="tertiary">
                    {t(
                      values.settlement === 'refund'
                        ? 'sales.creditNote.consequence.refund'
                        : 'sales.creditNote.consequence.advance',
                      { amount: formatInr(split.left), party }
                    )}
                  </UbText>
                )}
              </UbStack>
            </UbStack>
          </UbPanel>
        </UbGrid>
      </UbForm>
    </UbPageShell>
  );
}
