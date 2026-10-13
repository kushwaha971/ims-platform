'use client';

import { useCallback, useMemo, useState } from 'react';

import { useFieldArray, type UseFormReturn } from 'react-hook-form';

import {
  UbAsyncCombobox,
  UbCheckbox,
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
import { formatAmount, formatInr } from 'src/utils/money';
import { formatQuantity } from 'src/utils/quantity';
import { comboPaging } from 'src/utils/searchPaging';

import { getPartyRates } from '../../inventory/api/priceListService';
import { LastRateNote } from '../../inventory/components/LastRateNote';
import { useItemSearch } from '../../inventory/hooks/useItemSearch';
import {
  emptyLine,
  ratePlaces,
  type InvoiceFormValues,
  type InvoiceLineForm,
} from '../view-model/invoiceForm';

import type { ItemListRow } from '../../inventory/types/item.types';
import type { EngineResult } from '../view-model/taxEngine';

const MAX_LINES = 100;

/** The item cell — search by name/SKU, and the scanner path on Enter (FR-2, FR-18). */
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
  line: InvoiceLineForm | undefined;
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
      onOpen={search.activate}
      paging={comboPaging(search, t)}
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
      placeholder={t('sales.line.itemPlaceholder')}
      searchPlaceholder={t('items.list.searchPlaceholder')}
      emptyLabel={t('sales.line.itemEmpty')}
      loadingLabel={t('common.loading')}
      invalid={invalid}
    />
  );
}

/**
 * SAL-02 FR-2 / §7 — the line grid on `UbLineItemsEditor` (built to this
 * requirement in INV-06): item, qty, rate with Incl./Excl. GST, discount, GST
 * code, and the computed taxable value and line total from the preview. Enter
 * moves cell to cell, Alt+N adds a line, Ctrl+Enter issues; a phone gets cards.
 *
 * The tracks' minimums add up to what the editor column has at a 1280 desktop
 * (696 px: 36.5rem of tracks + six 0.5rem gaps + the 2.5rem remove button +
 * the row's padding) — above them the table clipped its Total column (QA S-D5).
 * A test sums them; widen one only by narrowing another.
 */
export function InvoiceLinesSection({
  form,
  preview,
  rateOptions,
  taxFree,
  disabled,
  onSubmitShortcut,
}: Readonly<{
  form: UseFormReturn<InvoiceFormValues>;
  preview: EngineResult;
  rateOptions: readonly { code: string; name: string }[];
  taxFree: boolean;
  disabled: boolean;
  onSubmitShortcut: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { control, watch, setValue, getValues, trigger } = form;
  const fieldArray = useFieldArray({ control, name: 'lines', keyName: 'key' });
  const lines = watch('lines');
  const partyId = watch('partyId');
  const partyName = watch('partyName');
  /** Items whose rate came from the customer's price list, and that rate. */
  const [listed, setListed] = useState<Record<string, { name: string; rate: string }>>({});
  /**
   * QA B1 — stock on hand of each tracked item, as the picker read it. The
   * server still decides at issue; this only warns while the quantity is typed,
   * so "Only 5 in stock" is seen before Issue rather than after it.
   */
  const [stock, setStock] = useState<Record<string, { onHand: string; unit: string }>>({});

  // FR-15 — item defaults fill a line when the item is PICKED, never later.
  const pick = useCallback(
    (index: number, row: ItemListRow) => {
      const base = `lines.${index}` as const;
      setValue(`${base}.itemId`, row.id, { shouldDirty: true });
      setValue(`${base}.description`, row.name);
      setValue(`${base}.unitCode`, row.unit.code);
      setValue(`${base}.allowDecimal`, row.unit.allowDecimal);
      setValue(`${base}.unitPrice`, row.sellingPrice);
      setValue(`${base}.taxCode`, row.taxCode);
      setValue(`${base}.hsnSac`, row.hsnSac ?? '');
      setValue(`${base}.taxInclusive`, row.taxInclusiveSelling ?? false);
      if (row.trackStock && row.onHand !== null) {
        const onHand = row.onHand;
        setStock((current) => ({ ...current, [row.id]: { onHand, unit: row.unit.code } }));
      }
      // Shop gap §1.6 — a customer on a price list starts from the list's rate.
      // Still a default filled at the pick (FR-15), only a party-specific one;
      // if it cannot be read the item's own price stands.
      if (!partyId) return;
      void getPartyRates(partyId, [row.id])
        .then(({ priceList, rates }) => {
          const listed = rates[row.id];
          if (!priceList || !listed) return;
          if (getValues(`${base}.itemId`) !== row.id) return;
          setValue(`${base}.unitPrice`, listed.rate, { shouldDirty: true });
          setValue(`${base}.taxInclusive`, listed.taxInclusive, { shouldDirty: true });
          setListed((current) => ({
            ...current,
            [row.id]: { name: priceList.name, rate: listed.rate },
          }));
        })
        .catch(() => undefined);
    },
    [setValue, getValues, partyId]
  );

  const taxOptions = useMemo(
    () => rateOptions.map((r) => ({ value: r.code, label: r.name })),
    [rateOptions]
  );

  const columns = useMemo<UbLineItemsColumn[]>(
    () => [
      {
        id: 'item',
        header: t('sales.line.item'),
        field: 'itemId',
        track: 'minmax(9rem,2.6fr)',
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
        header: t('sales.line.qty'),
        field: 'qty',
        track: 'minmax(9rem,1fr)',
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
        id: 'rate',
        header: t('sales.line.rate'),
        field: 'unitPrice',
        track: 'minmax(6.25rem,1.3fr)',
        align: 'end',
        render: ({ field, id, label, invalid, index }) => (
          <UbStack gap={1}>
            <UbMoneyInput
              id={id}
              aria-label={label}
              value={(field?.value as string) ?? ''}
              onChange={(next) => field?.onChange(next)}
              decimalPlaces={ratePlaces((field?.value as string) ?? '')}
              invalid={invalid}
              placeholder={t('sales.line.ratePlaceholder')}
            />
            {!taxFree && (
              <UbCheckbox
                checked={lines?.[index]?.taxInclusive ?? false}
                onChange={(checked) =>
                  setValue(`lines.${index}.taxInclusive`, checked, { shouldDirty: true })
                }
                label={t('sales.line.inclusive')}
              />
            )}
          </UbStack>
        ),
      },
      {
        id: 'discount',
        header: t('sales.line.discountPct'),
        field: 'discountValue',
        track: 'minmax(4.5rem,0.9fr)',
        align: 'end',
        render: ({ field, id, label, index, invalid }) => (
          <UbMoneyInput
            id={id}
            aria-label={label}
            value={(field?.value as string) ?? ''}
            currencySymbol="%"
            decimalPlaces={2}
            invalid={invalid}
            onChange={(next) => {
              field?.onChange(next);
              setValue(`lines.${index}.discountType`, next ? 'percent' : '', { shouldDirty: true });
              // QA B8 — "150 %" is refused under the cell as it is typed, not at Issue.
              void trigger(`lines.${index}.discountValue`);
            }}
            placeholder="0"
          />
        ),
      },
      ...(taxFree
        ? []
        : [
            {
              id: 'tax',
              header: t('sales.line.gst'),
              field: 'taxCode',
              track: 'minmax(6rem,1fr)',
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
            } satisfies UbLineItemsColumn,
          ]),
      {
        id: 'total',
        header: t('sales.line.total'),
        track: 'minmax(5.5rem,1fr)',
        align: 'end',
        // QA S-D8 — a phone card's total stands alone, so it carries its ₹; the
        // table's column header already says what the figures are.
        render: ({ index, layout }) => (
          <UbStack gap={0} className="items-end">
            <UbText as="span" variant="body-sm" className="ds-num leading-10">
              {(layout === 'card' ? formatInr : formatAmount)(
                preview.lines[index]?.lineTotal ?? '0'
              )}
            </UbText>
            {!taxFree && (
              <UbText as="span" variant="caption" tone="tertiary" className="ds-num">
                {t('sales.line.taxable', {
                  amount: formatAmount(preview.lines[index]?.taxableValue ?? '0'),
                })}
              </UbText>
            )}
          </UbStack>
        ),
      },
    ],
    [t, lines, disabled, pick, taxFree, taxOptions, preview, setValue, trigger]
  );

  // Shop gap §1.5 — what this customer paid for this item last time.
  const renderLineNote = useCallback(
    (index: number) => {
      const line = lines?.[index];
      if (!line?.itemId) return null;
      const held = stock[line.itemId];
      const short = held !== undefined && Number(line.qty || 0) > Number(held.onHand);
      const stockNote = short ? (
        <UbText variant="caption" tone="error" data-testid="line-stock-short">
          {t('sales.line.stockShort', {
            qty: formatQuantity(String(Math.max(Number(held.onHand), 0)), held.unit),
          })}
        </UbText>
      ) : null;
      if (!partyId) return stockNote;
      const fromList = listed[line.itemId];
      const onList = fromList && Number(fromList.rate) === Number(line.unitPrice || 0);
      return (
        <UbStack gap={0}>
          {stockNote}
          {onList && (
            <UbText variant="caption" tone="secondary" data-testid="price-list-applied">
              {t('sales.line.priceListRate', { list: fromList.name })}
            </UbText>
          )}
          <LastRateNote
            itemId={line.itemId}
            partyId={partyId}
            partyName={partyName}
            side="sales"
            current={line.unitPrice}
            currentInclusive={line.taxInclusive}
            onUse={(last) => {
              setValue(`lines.${index}.unitPrice`, last.rate, { shouldDirty: true });
              setValue(`lines.${index}.taxInclusive`, last.taxInclusive, { shouldDirty: true });
            }}
          />
        </UbStack>
      );
    },
    [lines, partyId, partyName, setValue, listed, stock, t]
  );

  return (
    <UbLineItemsEditor<InvoiceFormValues, 'lines'>
      tableFrom={1536}
      control={control}
      name="lines"
      fieldArray={fieldArray}
      columns={columns}
      newLine={emptyLine}
      maxLines={MAX_LINES}
      disabled={disabled}
      onSubmitShortcut={onSubmitShortcut}
      renderLineNote={renderLineNote}
      labels={{
        addLine: t('sales.line.add'),
        removeLine: (n) => t('sales.line.remove', { n }),
        lineLabel: (n) => t('sales.line.label', { n }),
        empty: t('sales.line.empty'),
        maxReached: t('sales.line.max'),
      }}
    />
  );
}
