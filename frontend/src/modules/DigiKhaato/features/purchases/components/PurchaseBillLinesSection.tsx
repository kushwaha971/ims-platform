'use client';

import { useCallback, useMemo } from 'react';

import { useFieldArray, type UseFormReturn } from 'react-hook-form';

import {
  UbAsyncCombobox,
  UbLineItemsEditor,
  UbMoneyInput,
  UbQuantityInput,
  UbSelect,
  UbStack,
  UbText,
  type UbLineItemsColumn,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { formatAmount } from 'src/utils/money';
import { taxRateLabel } from 'src/utils/taxRateLabel';

import { useItemSearch } from '../../inventory/hooks/useItemSearch';
import { ratePlaces } from '../../sales/view-model/invoiceForm';
import { PURCHASE_MAX_LINES } from '../constants/purchaseConstants';
import {
  emptyPurchaseLine,
  lastCostChange,
  type PurchaseBillFormValues,
  type PurchaseLineForm,
} from '../view-model/purchaseBillForm';

import type { ItemListRow } from '../../inventory/types/item.types';
import type { EngineResult } from '../../sales/view-model/taxEngine';

/** The item cell — search by name/SKU, and the scanner path on Enter (FR-3, AC-2). */
function ItemCell({
  id,
  label,
  invalid,
  line,
  disabled,
  onPick,
}: Readonly<{
  id: string;
  label: string;
  invalid: boolean;
  line: PurchaseLineForm | undefined;
  disabled: boolean;
  onPick: (row: ItemListRow) => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const search = useItemSearch();
  return (
    <UbAsyncCombobox
      id={id}
      aria-label={label}
      value={line?.itemId ?? null}
      selectedLabel={line?.description}
      query={search.query}
      onQueryChange={search.setQuery}
      options={search.options}
      loading={search.status === 'loading'}
      disabled={disabled}
      onSelect={(option) => {
        const row = search.find(option.value);
        if (row) onPick(row);
      }}
      onSubmitQuery={(code) => {
        void search.lookup(code).then((row) => {
          if (row) onPick(row);
          else
            dispatch(
              showSnackbar({ severity: 'warning', id: 'items.scan.notFound', params: { code } })
            );
        });
      }}
      placeholder={t('purchases.line.itemPlaceholder')}
      searchPlaceholder={t('items.list.searchPlaceholder')}
      emptyLabel={t('purchases.line.itemEmpty')}
      loadingLabel={t('common.loading')}
      invalid={invalid}
    />
  );
}

/**
 * PUR-01 FR-3 / §7 — the purchase-mode lines on `UbLineItemsEditor`, the same
 * editor the invoice uses, with a COST column where the invoice has a rate:
 * item, qty, cost (4 dp when it carries paise fractions), discount %, GST code
 * (editable — "supplier bills may differ"), and the computed line total with
 * its taxable value beneath. No "Incl. GST" switch (EC-5: "Enter cost before
 * GST"). Enter moves cell to cell, Alt+N adds a line, Ctrl+Enter records; a
 * phone gets cards.
 *
 * Under each line: "Last cost ₹46.00 (+13 %)" when the typed cost differs from
 * the item's (Alternate E), and "differs from item (GST5)" when the code does
 * (§8) — both hints, never errors.
 */
export function PurchaseBillLinesSection({
  form,
  preview,
  rateOptions,
  disabled,
  onSubmitShortcut,
}: Readonly<{
  form: UseFormReturn<PurchaseBillFormValues>;
  preview: EngineResult;
  rateOptions: readonly { code: string; name: string }[];
  disabled: boolean;
  onSubmitShortcut: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { control, watch, setValue } = form;
  const fieldArray = useFieldArray({ control, name: 'lines', keyName: 'key' });
  const lines = watch('lines');

  // FR-3 — item defaults fill a line when the item is PICKED, never later.
  const pick = useCallback(
    (index: number, row: ItemListRow) => {
      const base = `lines.${index}` as const;
      setValue(`${base}.itemId`, row.id, { shouldDirty: true });
      setValue(`${base}.description`, row.name);
      setValue(`${base}.unitCode`, row.unit.code);
      setValue(`${base}.allowDecimal`, row.unit.allowDecimal);
      // `purchasePrice` is null for a role without cost visibility (INV-01):
      // the line starts empty rather than carrying "null" into the form.
      const cost = row.purchasePrice ?? '';
      setValue(`${base}.unitCost`, cost === '0.00' ? '' : cost);
      setValue(`${base}.lastCost`, cost);
      setValue(`${base}.taxCode`, row.taxCode);
      setValue(`${base}.itemTaxCode`, row.taxCode);
    },
    [setValue]
  );

  const taxOptions = useMemo(
    () => rateOptions.map((r) => ({ value: r.code, label: taxRateLabel(r, t) })),
    [rateOptions, t]
  );

  const columns = useMemo<UbLineItemsColumn[]>(
    () => [
      {
        id: 'item',
        header: t('purchases.line.item'),
        field: 'itemId',
        track: 'minmax(11rem,2.6fr)',
        card: 'title',
        render: ({ index, id, label, invalid }) => (
          <ItemCell
            id={id}
            label={label}
            invalid={invalid}
            line={lines?.[index]}
            disabled={disabled}
            onPick={(row) => pick(index, row)}
          />
        ),
      },
      {
        id: 'qty',
        header: t('purchases.line.qty'),
        field: 'qty',
        track: 'minmax(6rem,1fr)',
        align: 'end',
        render: ({ field, id, label, invalid, index }) => (
          <UbQuantityInput
            id={id}
            aria-label={label}
            value={(field?.value as string) ?? ''}
            onChange={(next) => field?.onChange(next)}
            decimals={lines?.[index]?.allowDecimal === false ? 0 : 3}
            unit={lines?.[index]?.unitCode || undefined}
            invalid={invalid}
          />
        ),
      },
      {
        id: 'cost',
        header: t('purchases.line.cost'),
        field: 'unitCost',
        track: 'minmax(8rem,1.3fr)',
        align: 'end',
        render: ({ field, id, label, invalid }) => (
          <UbMoneyInput
            id={id}
            aria-label={label}
            value={(field?.value as string) ?? ''}
            onChange={(next) => field?.onChange(next)}
            decimalPlaces={ratePlaces((field?.value as string) ?? '')}
            invalid={invalid}
            placeholder={t('purchases.line.costPlaceholder')}
          />
        ),
      },
      {
        id: 'discount',
        header: t('purchases.line.discountPct'),
        field: 'discountValue',
        track: 'minmax(5.5rem,0.9fr)',
        align: 'end',
        render: ({ field, id, label, index }) => (
          <UbMoneyInput
            id={id}
            aria-label={label}
            value={(field?.value as string) ?? ''}
            currencySymbol="%"
            decimalPlaces={2}
            onChange={(next) => {
              field?.onChange(next);
              setValue(`lines.${index}.discountType`, next ? 'percent' : '', { shouldDirty: true });
            }}
            placeholder="0"
          />
        ),
      },
      {
        id: 'tax',
        header: t('purchases.line.gst'),
        field: 'taxCode',
        track: 'minmax(6.5rem,1fr)',
        render: ({ field, id, label }) => (
          <UbSelect
            id={id}
            aria-label={label}
            value={(field?.value as string) ?? ''}
            options={taxOptions}
            onChange={(next) => field?.onChange(next)}
            disabled={disabled}
          />
        ),
      },
      {
        id: 'total',
        header: t('purchases.line.total'),
        track: 'minmax(6.5rem,1fr)',
        align: 'end',
        render: ({ index }) => (
          <UbStack gap={0} className="items-end">
            <UbText as="span" variant="body-sm" className="ds-num leading-10">
              {formatAmount(preview.lines[index]?.lineTotal ?? '0')}
            </UbText>
            <UbText as="span" variant="caption" tone="tertiary" className="ds-num">
              {t('purchases.line.taxable', {
                amount: formatAmount(preview.lines[index]?.taxableValue ?? '0'),
              })}
            </UbText>
          </UbStack>
        ),
      },
    ],
    [t, lines, disabled, pick, taxOptions, preview, setValue]
  );

  const renderLineNote = useCallback(
    (index: number) => {
      const line = lines?.[index];
      if (!line) return null;
      const change = lastCostChange(line.unitCost, line.lastCost);
      const taxDiffers = !!line.itemTaxCode && line.itemTaxCode !== line.taxCode;
      if (!change && !taxDiffers) return null;
      return (
        <UbStack gap={0}>
          {change && (
            <UbText variant="caption" tone="tertiary">
              {t('purchases.line.lastCost', {
                amount: formatAmount(line.lastCost),
                change: `${change.percent > 0 ? '+' : ''}${change.percent}`,
              })}
            </UbText>
          )}
          {taxDiffers && (
            <UbText variant="caption" tone="tertiary">
              {t('purchases.line.taxDiffers', { code: line.itemTaxCode })}
            </UbText>
          )}
        </UbStack>
      );
    },
    [lines, t]
  );

  return (
    <UbLineItemsEditor<PurchaseBillFormValues, 'lines'>
      control={control}
      name="lines"
      fieldArray={fieldArray}
      columns={columns}
      newLine={emptyPurchaseLine}
      maxLines={PURCHASE_MAX_LINES}
      disabled={disabled}
      onSubmitShortcut={onSubmitShortcut}
      renderLineNote={renderLineNote}
      labels={{
        addLine: t('purchases.line.add'),
        removeLine: (n) => t('purchases.line.remove', { n }),
        lineLabel: (n) => t('purchases.line.label', { n }),
        empty: t('purchases.line.empty'),
        maxReached: t('purchases.line.max'),
      }}
    />
  );
}
