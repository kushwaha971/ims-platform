'use client';

import { type UseFormReturn } from 'react-hook-form';

import {
  UbChoiceChips,
  UbDivider,
  UbField,
  UbInfoRow,
  UbMoneyInput,
  UbPanel,
  UbStack,
  UbSwitch,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { sgstLabelId } from '../view-model/invoiceDisplay';

import type { DiscountType, Rule46Check, SalesWarning } from '../types/sales.types';
import type { InvoiceFormValues } from '../view-model/invoiceForm';
import type { EngineResult } from '../view-model/taxEngine';

/**
 * SAL-02 §7 `UbTotalsPanel` — the breakup a merchant checks before issuing:
 * subtotal, the document discount (F6), taxable, the split (CGST + SGST/UTGST,
 * or IGST), cess, round-off and the grand total, announced politely to a
 * screen reader as it changes (§5). Rule 46 reads "9/9" when complete.
 */
export function InvoiceTotalsPanel({
  form,
  preview,
  taxFree,
  rule46,
  warnings,
  disabled,
}: Readonly<{
  form: UseFormReturn<InvoiceFormValues>;
  preview: EngineResult;
  taxFree: boolean;
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
    <UbPanel as="aside" className="lg:sticky lg:top-4">
      <UbStack gap={3} data-testid="invoice-totals">
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
          <UbText variant="caption" tone={rule46.passed ? 'success' : 'warning'}>
            {t('sales.rule46.status', { satisfied: rule46.satisfied, total: rule46.total })}
          </UbText>
        )}
        {warnings.map((warning) => (
          <UbText key={warning.code} variant="caption" tone="warning" role="status">
            {warning.message}
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
