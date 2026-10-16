'use client';

import { type UseFormReturn } from 'react-hook-form';

import {
  UbChoiceChips,
  UbButton,
  UbPopover,
  UbDivider,
  UbField,
  UbInfoRow,
  UbMoneyInput,
  UbPanel,
  UbStack,
  UbSwitch,
  UbText,
} from 'src/design-system';
import { EDITOR_TOTALS_PANEL_CLASS } from 'src/hooks/useDocksEditorTotals';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { salesWarningMessage, sgstLabelId } from '../view-model/invoiceDisplay';

import type { DiscountType, Rule46Check, SalesWarning } from '../types/sales.types';
import type { InvoiceFormValues } from '../view-model/invoiceForm';
import type { EngineResult } from '../view-model/taxEngine';

const ISSUE_COPY: Readonly<Record<string, string>> = {
  supplier_gstin_missing: 'sales.invoiceChecks.supplierGstin',
  supplier_address_missing: 'sales.invoiceChecks.supplierAddress',
  recipient_details_required: 'sales.invoiceChecks.recipientDetails',
  recipient_name_missing: 'sales.invoiceChecks.recipientName',
  recipient_address_missing: 'sales.invoiceChecks.recipientAddress',
  recipient_gstin_missing: 'sales.invoiceChecks.recipientGstin',
  hsn_missing: 'sales.invoiceChecks.itemTaxCode',
  description_missing: 'sales.invoiceChecks.description',
  no_lines: 'sales.invoiceChecks.lines',
  place_of_supply_missing: 'sales.invoiceChecks.placeOfSupply',
};

/**
 * SAL-02 §7 `UbTotalsPanel` — the breakup a merchant checks before issuing:
 * subtotal, the document discount (F6), taxable, the split (CGST + SGST/UTGST,
 * or IGST), cess, round-off and the grand total, announced politely to a
 * screen reader as it changes (§5). Missing invoice details have a checklist.
 */
export function InvoiceTotalsPanel({
  form,
  preview,
  taxFree,
  estimated = false,
  rule46,
  warnings,
  disabled,
}: Readonly<{
  form: UseFormReturn<InvoiceFormValues>;
  preview: EngineResult;
  taxFree: boolean;
  /** SAL-01 §8 — an estimate's tax is labelled "Estimated GST (final on invoice)". */
  estimated?: boolean;
  rule46: Rule46Check | null;
  warnings: readonly SalesWarning[];
  disabled: boolean;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { watch, setValue } = form;
  const discountType = watch('discountType');
  const roundOff = watch('roundOffEnabled');
  const pos = watch('placeOfSupplyState');
  const row = (label: string, value: string) => (
    <UbInfoRow label={label} value={<UbText className="ds-num">{value}</UbText>} />
  );

  return (
    <UbPanel as="aside" className={EDITOR_TOTALS_PANEL_CLASS}>
      <UbStack gap={3} className="p-4" data-testid="invoice-totals">
        {row(t('sales.totals.subtotal'), formatInr(preview.subtotal))}
        <UbChoiceChips<DiscountType>
          ariaLabel={t('sales.totals.discountType')}
          value={discountType || 'amount'}
          options={[
            { value: 'amount', label: t('sales.totals.discountAmount') },
            { value: 'percent', label: t('sales.totals.discountPercent') },
          ]}
          disabled={disabled}
          onChange={(next) => setValue('discountType', next, { shouldDirty: true })}
        />
        <UbField
          name="discountValue"
          label={t('sales.totals.discount')}
          placeholder={t('sales.totals.discountPlaceholder')}
        >
          {(field) => (
            <UbMoneyInput
              id={field.id}
              value={field.value as string}
              currencySymbol={discountType === 'percent' ? '%' : '₹'}
              decimalPlaces={2}
              onChange={(next) => {
                field.onChange(next);
                if (!discountType) setValue('discountType', 'amount', { shouldDirty: true });
              }}
              placeholder={field.placeholder}
            />
          )}
        </UbField>
        {preview.discountAmount !== '0.00' &&
          row(t('sales.totals.discount'), `−${formatInr(preview.discountAmount)}`)}
        {row(t('sales.totals.taxable'), formatInr(preview.taxableTotal))}
        {estimated && !taxFree && (
          <UbText variant="caption" tone="tertiary" data-testid="estimated-gst">
            {t('sales.estimate.taxPreview')}
          </UbText>
        )}
        {!taxFree &&
          preview.igstTotal !== '0.00' &&
          row(t('sales.tax.igst'), formatInr(preview.igstTotal))}
        {!taxFree && preview.igstTotal === '0.00' && (
          <>
            {row(t('sales.tax.cgst'), formatInr(preview.cgstTotal))}
            {row(t(sgstLabelId(pos, preview.isInterState)), formatInr(preview.sgstTotal))}
          </>
        )}
        {preview.cessTotal !== '0.00' && row(t('sales.tax.cess'), formatInr(preview.cessTotal))}
        <UbSwitch
          checked={roundOff}
          onCheckedChange={(checked) => setValue('roundOffEnabled', checked, { shouldDirty: true })}
          label={t('sales.totals.roundOff')}
          description={formatInr(preview.roundOff)}
          disabled={disabled}
        />
        <UbDivider />
        <UbStack direction="row" justify="between" align="center" aria-live="polite">
          <UbText variant="h4">{t('sales.totals.grand')}</UbText>
          <UbText variant="h3" className="ds-num" data-testid="invoice-grand-total">
            {formatInr(preview.grandTotal)}
          </UbText>
        </UbStack>
        {rule46 && (
          <UbPopover
            label={t('sales.invoiceChecks.title')}
            className="max-h-[calc(100dvh-2rem)] p-4"
            trigger={
              <UbButton
                variant="ghost"
                size="sm"
                className="h-auto justify-start whitespace-normal px-0 text-left"
              >
                {t('sales.rule46.status', { satisfied: rule46.satisfied, total: rule46.total })}
              </UbButton>
            }
          >
            {rule46.issues.length === 0 ? (
              <UbText variant="body-sm" tone="success">
                {t('sales.invoiceChecks.complete')}
              </UbText>
            ) : (
              <UbStack as="ul" gap={3}>
                {rule46.issues.map((issue) => {
                  const message = t(ISSUE_COPY[issue.code] ?? 'sales.invoiceChecks.other');
                  const line = /^lines\.(\d+)\./.exec(issue.field);
                  return (
                    <UbStack as="li" key={`${issue.code}:${issue.field}`} gap={1}>
                      <UbText variant="body-sm">
                        {line
                          ? t('sales.invoiceChecks.line', { line: Number(line[1]) + 1, message })
                          : message}
                      </UbText>
                      <UbText
                        variant="caption"
                        tone={issue.severity === 'hard' ? 'formError' : 'secondary'}
                      >
                        {t(
                          issue.severity === 'hard'
                            ? 'sales.invoiceChecks.required'
                            : 'sales.invoiceChecks.recommended'
                        )}
                      </UbText>
                    </UbStack>
                  );
                })}
              </UbStack>
            )}
          </UbPopover>
        )}
        {warnings.map((warning, index) => (
          <UbText key={`${warning.code}-${index}`} variant="caption" tone="warning" role="status">
            {salesWarningMessage(warning, t)}
          </UbText>
        ))}
        {taxFree && (
          <UbText variant="caption" tone="tertiary">
            {t('sales.editor.noTaxHint')}
          </UbText>
        )}
      </UbStack>
    </UbPanel>
  );
}
