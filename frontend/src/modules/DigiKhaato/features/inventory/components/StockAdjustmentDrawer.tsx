'use client';

import { useCallback, useEffect, useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import {
  UbAmount,
  UbAsyncCombobox,
  UbButton,
  UbDateInput,
  UbDrawer,
  UbField,
  UbForm,
  UbInfoRow,
  UbLineItemsEditor,
  UbMoneyInput,
  UbQuantityInput,
  UbSelect,
  UbStatusBanner,
  UbText,
  UbTextInput,
  isoToday,
  type UbLineItemsColumn,
} from 'src/design-system';
import { useScannerListener } from 'src/hooks/useScannerListener';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { formatQuantity } from 'src/utils/quantity';

import { ADJUSTMENT_MAX_LINES, ADJUSTMENT_REASONS } from '../constants/inventoryConstants';
import { useInventoryMasters } from '../hooks/useInventoryMasters';
import { useItemSearch } from '../hooks/useItemSearch';
import { lineFromRow, type UseStockAdjustmentResult } from '../hooks/useStockAdjustment';
import { useInventorySchemas } from '../validation/inventorySchemas';
import {
  isInboundLine,
  onHandAfter,
  totalValueImpact,
  valueImpact,
} from '../view-model/adjustmentMath';

import type { AdjustmentFormLine, AdjustmentFormValues, ItemListRow } from '../types/item.types';

/**
 * INV-06 — post a stock adjustment: a reason, a date, and lines in the
 * line-items editor's adjustment subset (Item · On hand · Mode · Qty · Unit
 * cost · After · Value). The footer's consequence line ("2 items · −₹312.00")
 * is the confirmation; the mandatory reason is why there is no extra dialog.
 * A 409 marks every short line at once with what is actually available.
 */
const EMPTY_LINE = (): AdjustmentFormLine => ({
  itemId: '',
  itemName: '',
  unitCode: '',
  allowDecimal: true,
  onHand: '0.000',
  avgCost: '0.0000',
  mode: 'by',
  qty: '',
  unitCost: '',
});

function ItemCell({
  index,
  label,
  id,
  invalid,
  line,
  onPick,
}: Readonly<{
  index: number;
  label: string;
  id: string;
  invalid: boolean;
  line: AdjustmentFormLine;
  onPick: (index: number, row: ItemListRow) => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const search = useItemSearch({ trackedOnly: true });
  const dispatch = useAppDispatch();
  return (
    <UbAsyncCombobox
      id={id}
      aria-label={label}
      value={line.itemId || null}
      selectedLabel={line.itemName}
      query={search.query}
      onQueryChange={search.setQuery}
      options={search.options}
      loading={search.status === 'loading'}
      onSelect={(option) => {
        const row = search.find(option.value);
        if (row) onPick(index, row);
      }}
      onSubmitQuery={(code) => {
        void search.lookup(code).then((row) => {
          if (row) onPick(index, row);
          else
            dispatch(
              showSnackbar({ severity: 'warning', id: 'items.scan.notFound', params: { code } })
            );
        });
      }}
      placeholder={t('stock.adjust.line.item.placeholder')}
      searchPlaceholder={t('items.list.searchPlaceholder')}
      emptyLabel={t('stock.adjust.line.item.empty')}
      loadingLabel={t('common.loading')}
      invalid={invalid}
    />
  );
}

export function StockAdjustmentDrawer({
  adjustment,
}: Readonly<{ adjustment: UseStockAdjustmentResult }>): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const {
    open,
    prefill,
    isPosting,
    canAdjust,
    shortLines,
    negativeOff,
    formErrors,
    close,
    submit,
  } = adjustment;
  const masters = useInventoryMasters();
  const { adjustmentSchema } = useInventorySchemas(masters.units);

  const form = useForm<AdjustmentFormValues>({
    resolver: yupResolver(adjustmentSchema),
    mode: 'onTouched',
    defaultValues: { adjustmentDate: isoToday(), reason: '', note: '', lines: [] },
  });
  const { control, reset, setError, setValue, getValues, formState } = form;
  const fieldArray = useFieldArray({ control, name: 'lines', keyName: 'key' });

  useEffect(() => {
    if (open) {
      reset({
        adjustmentDate: isoToday(),
        reason: '',
        note: '',
        lines: prefill.length ? prefill.map((line) => ({ ...line })) : [EMPTY_LINE()],
      });
    }
  }, [open, prefill, reset]);

  const lines = useWatch({ control, name: 'lines' });
  const reason = useWatch({ control, name: 'reason' });

  const pick = useCallback(
    (index: number, row: ItemListRow) => {
      const current = getValues('lines');
      const existing = current.findIndex((line, i) => i !== index && line.itemId === row.id);
      if (existing >= 0) {
        /* EC-9 — the same item again: "Adjust by" counts one more; "Set to"
           just goes back to the line (a count is typed, not tallied). */
        const line = current[existing];
        if (line && line.mode === 'by') {
          const next = String(Number(line.qty || '0') + 1);
          setValue(`lines.${existing}.qty`, next, { shouldValidate: true });
        }
        if (!current[index]?.itemId) fieldArray.remove(index);
        return;
      }
      setValue(
        `lines.${index}`,
        { ...lineFromRow(row), mode: current[index]?.mode ?? 'by' },
        { shouldValidate: false }
      );
    },
    [getValues, setValue, fieldArray]
  );

  /* FR-7 — a HID scan anywhere in the drawer adds (or counts) a line. */
  const itemSearch = useItemSearch({ trackedOnly: true });
  const dispatch = useAppDispatch();
  useScannerListener(
    (code) => {
      void itemSearch.lookup(code).then((row) => {
        if (!row) {
          dispatch(
            showSnackbar({ severity: 'warning', id: 'items.scan.notFound', params: { code } })
          );
          return;
        }
        const current = getValues('lines');
        const existing = current.findIndex((line) => line.itemId === row.id);
        const blank = current.findIndex((line) => !line.itemId);
        if (existing >= 0) {
          const line = current[existing];
          if (line?.mode === 'by') {
            setValue(`lines.${existing}.qty`, String(Number(line.qty || '0') + 1), {
              shouldValidate: true,
            });
          }
        } else if (blank >= 0) {
          pick(blank, row);
        } else if (current.length < ADJUSTMENT_MAX_LINES) {
          fieldArray.append({ ...lineFromRow(row), qty: '1' });
        }
      });
    },
    { enabled: open }
  );

  /* Keyed by ITEM, not by the server's line index: blank rows are dropped
     before posting, so the server's index 0 can be the form's row 2. */
  const shortByItem = useMemo(
    () => new Map(shortLines.map((line) => [line.itemId, line])),
    [shortLines]
  );
  const shortAt = useCallback(
    (index: number) => {
      const itemId = lines?.[index]?.itemId;
      return itemId ? shortByItem.get(itemId) : undefined;
    },
    [lines, shortByItem]
  );

  const columns = useMemo<UbLineItemsColumn[]>(
    () => [
      {
        id: 'item',
        header: t('stock.adjust.col.item'),
        field: 'itemId',
        track: 'minmax(10rem,3fr)',
        card: 'title',
        render: ({ index, id, label, invalid }) => (
          <ItemCell
            index={index}
            id={id}
            label={label}
            invalid={invalid}
            line={lines?.[index] ?? EMPTY_LINE()}
            onPick={pick}
          />
        ),
      },
      {
        id: 'onHand',
        header: t('stock.adjust.col.onHand'),
        track: 'minmax(4.5rem,1fr)',
        align: 'end',
        render: ({ index }) => {
          const line = lines?.[index];
          return (
            <UbText as="span" variant="body-sm" className="ds-num leading-10">
              {line?.itemId ? formatQuantity(line.onHand, line.unitCode) : '—'}
            </UbText>
          );
        },
      },
      {
        id: 'mode',
        header: t('stock.adjust.col.mode'),
        field: 'mode',
        track: 'minmax(6.5rem,1.2fr)',
        render: ({ field, id, label }) => (
          <UbSelect
            id={id}
            aria-label={label}
            value={(field?.value as string) ?? 'by'}
            onChange={(next) => field?.onChange(next)}
            options={[
              { value: 'by', label: t('stock.adjust.mode.by') },
              { value: 'to', label: t('stock.adjust.mode.to') },
            ]}
          />
        ),
      },
      {
        id: 'qty',
        header: t('stock.adjust.col.qty'),
        field: 'qty',
        track: 'minmax(6rem,1.3fr)',
        align: 'end',
        render: ({ field, id, label, invalid, index }) => {
          const line = lines?.[index];
          return (
            <UbQuantityInput
              id={id}
              aria-label={label}
              value={(field?.value as string) ?? ''}
              onChange={(next) => field?.onChange(next)}
              onBlur={field?.onBlur}
              decimals={line?.allowDecimal === false ? 0 : 3}
              signed={line?.mode !== 'to'}
              unit={line?.unitCode || undefined}
              invalid={invalid || Boolean(shortAt(index))}
              placeholder={
                line?.mode === 'to'
                  ? t('stock.adjust.qty.setTo.placeholder')
                  : t('stock.adjust.qty.by.placeholder')
              }
            />
          );
        },
      },
      {
        id: 'unitCost',
        header: t('stock.adjust.col.cost'),
        field: 'unitCost',
        track: 'minmax(7rem,1.4fr)',
        align: 'end',
        render: ({ field, id, label, invalid, index }) => {
          const line = lines?.[index];
          const inbound = line ? isInboundLine(line) : false;
          return (
            <UbMoneyInput
              id={id}
              aria-label={label}
              value={inbound ? ((field?.value as string) ?? '') : ''}
              onChange={(next) => field?.onChange(next)}
              onBlur={field?.onBlur}
              decimalPlaces={4}
              disabled={!inbound}
              invalid={invalid}
              placeholder={
                inbound
                  ? t('items.form.opening.cost.placeholder')
                  : t('stock.adjust.cost.atAverage')
              }
            />
          );
        },
      },
      {
        id: 'after',
        header: t('stock.adjust.col.after'),
        track: 'minmax(4.5rem,1fr)',
        align: 'end',
        render: ({ index }) => {
          const line = lines?.[index];
          const after = line?.itemId ? onHandAfter(line) : null;
          return (
            <UbText
              as="span"
              variant="body-sm"
              tone={after && after.startsWith('-') ? 'error' : 'primary'}
              className="ds-num leading-10"
            >
              {after ? formatQuantity(after, line?.unitCode) : '—'}
            </UbText>
          );
        },
      },
      {
        id: 'value',
        header: t('stock.adjust.col.value'),
        track: 'minmax(5.5rem,1.2fr)',
        align: 'end',
        render: ({ index }) => {
          const line = lines?.[index];
          const impact = line?.itemId ? valueImpact(line) : null;
          return impact ? (
            <UbAmount value={impact} size="sm" tone="neutral" className="leading-10" />
          ) : (
            <UbText as="span" variant="body-sm" tone="tertiary" className="leading-10">
              —
            </UbText>
          );
        },
      },
    ],
    [t, lines, pick, shortAt]
  );

  const total = useMemo(() => totalValueImpact(lines ?? []), [lines]);
  const filled = (lines ?? []).filter((line) => line.itemId).length;

  const handleSubmit = useCallback(
    async (values: AdjustmentFormValues) => {
      const cleaned = { ...values, lines: values.lines.filter((line) => line.itemId) };
      await submit(cleaned, setError);
    },
    [submit, setError]
  );

  const reasonOptions = useMemo(
    () => ADJUSTMENT_REASONS.map((value) => ({ value, label: t(`stock.adjust.reason.${value}`) })),
    [t]
  );

  return (
    <UbDrawer
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      title={t('stock.adjust.title')}
      description={t('stock.adjust.subtitle')}
      closeLabel={t('common.action.close')}
      dismissOnBackdrop={!formState.isDirty}
      className="lg:w-[820px]"
      footer={
        <>
          <UbText variant="body-sm" tone="secondary" className="mr-auto self-center">
            {t('stock.adjust.consequence', { count: filled })}{' '}
            <UbAmount value={total} size="sm" tone="neutral" />
          </UbText>
          <UbButton variant="secondary" onClick={close} disabled={isPosting}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={isPosting}
            busyLabel={t('stock.adjust.posting')}
            disabled={!canAdjust || filled === 0}
          >
            {t('stock.adjust.post')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={formErrors}>
        {shortLines.length > 0 && (
          <UbStatusBanner
            tone="error"
            title={t('stock.adjust.short.title', { count: shortLines.length })}
            description={negativeOff ? t('stock.adjust.short.negativeOff') : undefined}
          />
        )}
        <UbField
          name="reason"
          label={t('stock.adjust.reason.label')}
          placeholder={t('stock.adjust.reason.placeholder')}
          required
        >
          {(field) => <UbSelect {...field} value={field.value as string} options={reasonOptions} />}
        </UbField>
        <UbField
          name="adjustmentDate"
          label={t('stock.adjust.date.label')}
          placeholder={t('items.form.date.placeholder')}
        >
          {(field) => <UbDateInput {...field} value={field.value as string} max={isoToday()} />}
        </UbField>
        <UbField
          name="note"
          label={t('stock.adjust.note.label')}
          placeholder={t('stock.adjust.note.placeholder')}
          required={reason === 'other'}
        >
          {(field) => <UbTextInput {...field} autoComplete="off" maxLength={255} />}
        </UbField>

        <UbLineItemsEditor<AdjustmentFormValues, 'lines'>
          control={control}
          name="lines"
          fieldArray={fieldArray}
          columns={columns}
          newLine={EMPTY_LINE}
          maxLines={ADJUSTMENT_MAX_LINES}
          onSubmitShortcut={() => void form.handleSubmit(handleSubmit)()}
          lineInvalid={(index) => Boolean(shortAt(index))}
          lineNote={(index) => {
            const short = shortAt(index);
            return short ? (
              <UbText variant="body-sm" tone="error" role="alert">
                {t('stock.adjust.short.line', {
                  available: formatQuantity(short.available, short.unitCode),
                })}
              </UbText>
            ) : null;
          }}
          labels={{
            addLine: t('stock.adjust.addLine'),
            removeLine: (n) => t('stock.adjust.removeLine', { n }),
            lineLabel: (n) => t('stock.adjust.lineLabel', { n }),
            empty: t('stock.adjust.empty'),
            maxReached: t('stock.adjust.lines.max'),
          }}
          footer={
            <UbInfoRow
              variant="total"
              label={t('stock.adjust.valueImpact')}
              value={<UbAmount value={total} tone="neutral" />}
            />
          }
        />
      </UbForm>
    </UbDrawer>
  );
}
