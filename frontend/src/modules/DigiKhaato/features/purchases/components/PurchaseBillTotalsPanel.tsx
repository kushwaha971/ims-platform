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
  UbTextArea,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import type { EngineResult } from '../../sales/view-model/taxEngine';
import type { PurchaseDiscountType, PurchaseWarning } from '../types/purchase.types';
import type { PurchaseBillFormValues } from '../view-model/purchaseBillForm';

/**
 * PUR-01 FR-4 / §7 `UbTotalsPanel` — subtotal, the bill discount, taxable,
 * the split (CGST + SGST, or IGST for an inter-state supplier), cess,
 * round-off and the total, announced politely as it changes. When the shop
 * cannot claim input tax (FR-11, or ITC switched off) the tax is labelled
 * "GST (cost)" — it is part of what the goods cost. The total is shown
 * neutral: its khata effect is said once, in the toast at Record (§8).
 *
 * Not here: "Paid now" (FR-5) — supplier payments are PUR-02, the payments
 * track's; the section is not rendered until it can record one.
 */
export function PurchaseBillTotalsPanel({
  form,
  preview,
  claimable,
  warnings,
  disabled,
}: Readonly<{
  form: UseFormReturn<PurchaseBillFormValues>;
  preview: EngineResult;
  claimable: boolean;
  warnings: readonly PurchaseWarning[];
  disabled: boolean;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { watch, setValue } = form;
  const discountType = watch('discountType');
  const roundOff = watch('roundOffEnabled');
  const row = (label: string, value: string) => (
    <UbInfoRow label={label} value={<UbText className="ds-num">{value}</UbText>} />
  );
  const cost = claimable ? '' : ` ${t('purchases.tax.costSuffix')}`;

  return (
    <UbPanel as="aside" className="lg:sticky lg:top-4">
      <UbStack gap={3} className="p-4" data-testid="purchase-totals">
        {row(t('purchases.totals.subtotal'), formatInr(preview.subtotal))}
        <UbChoiceChips<PurchaseDiscountType>
          ariaLabel={t('purchases.totals.discountType')}
          value={discountType || 'amount'}
          options={[
            { value: 'amount', label: t('purchases.totals.discountAmount') },
            { value: 'percent', label: t('purchases.totals.discountPercent') },
          ]}
          disabled={disabled}
          onChange={(next) => setValue('discountType', next, { shouldDirty: true })}
        />
        <UbField
          name="discountValue"
          label={t('purchases.totals.discount')}
          placeholder={t('purchases.totals.discountPlaceholder')}
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
          row(t('purchases.totals.discount'), `−${formatInr(preview.discountAmount)}`)}
        {row(t('purchases.totals.taxable'), formatInr(preview.taxableTotal))}
        {preview.igstTotal !== '0.00' &&
          row(`${t('purchases.tax.igst')}${cost}`, formatInr(preview.igstTotal))}
        {preview.igstTotal === '0.00' && (
          <>
            {row(`${t('purchases.tax.cgst')}${cost}`, formatInr(preview.cgstTotal))}
            {row(`${t('purchases.tax.sgst')}${cost}`, formatInr(preview.sgstTotal))}
          </>
        )}
        {preview.cessTotal !== '0.00' && row(t('purchases.tax.cess'), formatInr(preview.cessTotal))}
        <UbSwitch
          checked={roundOff}
          onCheckedChange={(checked) => setValue('roundOffEnabled', checked, { shouldDirty: true })}
          label={t('purchases.totals.roundOff')}
          description={formatInr(preview.roundOff)}
          disabled={disabled}
        />
        <UbDivider />
        <UbStack direction="row" justify="between" align="center" aria-live="polite">
          <UbText variant="h4">{t('purchases.totals.grand')}</UbText>
          <UbText variant="h3" className="ds-num" data-testid="purchase-grand-total">
            {formatInr(preview.grandTotal)}
          </UbText>
        </UbStack>
        <UbText variant="caption" tone="tertiary">
          {t('purchases.totals.costHint')}
        </UbText>
        {warnings.map((warning) => (
          <UbText key={warning.code} variant="caption" tone="warning" role="status">
            {warning.message}
          </UbText>
        ))}
        <UbField
          name="notes"
          label={t('purchases.editor.notes')}
          placeholder={t('purchases.editor.notesPlaceholder')}
        >
          {(field) => (
            <UbTextArea
              id={field.id}
              value={(field.value as string) ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder={field.placeholder}
              maxLength={2000}
              rows={2}
              disabled={disabled}
            />
          )}
        </UbField>
      </UbStack>
    </UbPanel>
  );
}
