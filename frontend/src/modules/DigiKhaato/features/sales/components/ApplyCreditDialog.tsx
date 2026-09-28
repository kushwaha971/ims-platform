'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbEmptyState,
  UbField,
  UbForm,
  UbMoneyInput,
  UbSelect,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { selectInvoiceDetail } from '../redux/invoiceDetailSlice';
import { applyCreditNote, fetchOpenInvoices } from '../redux/salesFlowThunk';
import { useSalesFlowSchemas } from '../validation/salesFlowSchemas';

import type { SalesDocument } from '../types/sales.types';
import 'src/i18n/catalogues/sales';
import 'src/i18n/catalogues/validation';

const lesser = (a: string, b: string): string => (Number(a) <= Number(b) ? a : b);

/**
 * SAL-04 FR-9 / §6(b) — use a note's open credit on another unpaid bill of the
 * same party. The choices are that party's bills with something due (read
 * fresh when the dialog opens); the amount defaults to the most it can be —
 * the smaller of the open credit and the bill's due — and the server refuses
 * more than that on rows it has locked.
 */
export function ApplyCreditDialog({
  note,
  onClose,
}: Readonly<{ note: SalesDocument; onClose: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { openInvoices } = useAppSelector(selectInvoiceDetail);
  const { applySchemaFor } = useSalesFlowSchemas();
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const open = note.amountDue;

  useEffect(() => {
    if (!note.party) return undefined;
    const promise = dispatch(fetchOpenInvoices(note.party.id));
    void promise.then(() => setLoaded(true));
    return () => promise.abort();
  }, [dispatch, note.party]);

  const rhf = useForm<{ invoiceId: string; amount: string }>({
    resolver: yupResolver(applySchemaFor(open)),
    mode: 'onTouched',
    defaultValues: { invoiceId: '', amount: '' },
  });
  const invoiceId = useWatch({ control: rhf.control, name: 'invoiceId' });
  const chosen = openInvoices.find((row) => row.id === invoiceId) ?? null;
  const { setValue } = rhf;
  useEffect(() => {
    if (chosen) setValue('amount', lesser(open, chosen.amountDue));
  }, [chosen, open, setValue]);

  const options = useMemo(
    () =>
      openInvoices.map((row) => ({
        value: row.id,
        label: t('sales.creditNote.apply.option', {
          number: row.number ?? '',
          date: formatBusinessDate(row.documentDate),
          due: formatInr(row.amountDue),
        }),
      })),
    [openInvoices, t]
  );

  const submit = useCallback(
    async (values: { invoiceId: string; amount: string }) => {
      setBusy(true);
      const result = await dispatch(
        applyCreditNote({ id: note.id, invoiceId: values.invoiceId, amount: values.amount })
      );
      setBusy(false);
      if (!applyCreditNote.fulfilled.match(result)) return;
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'sales.creditNote.apply.done',
          params: { amount: formatInr(values.amount), number: chosen?.number ?? '' },
        })
      );
      onClose();
    },
    [dispatch, note.id, chosen, onClose]
  );

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('sales.creditNote.apply.title', { number: note.number ?? '' })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={busy}
            disabled={!options.length}
            data-testid="apply-confirm"
          >
            {t('sales.creditNote.apply.confirm')}
          </UbButton>
        </>
      }
    >
      <UbText variant="body-sm" tone="tertiary">
        {t('sales.creditNote.apply.open', { amount: formatInr(open) })}
      </UbText>
      {loaded && !options.length ? (
        <UbEmptyState
          variant="firstUse"
          title={t('sales.creditNote.apply.none')}
          description={t('sales.creditNote.apply.noneBody')}
        />
      ) : (
        <UbForm id={formId} form={rhf} onSubmit={submit}>
          <UbField
            name="invoiceId"
            label={t('sales.creditNote.apply.invoice')}
            placeholder={t('sales.creditNote.apply.invoicePlaceholder')}
            required
          >
            {(field) => (
              <UbSelect
                id={field.id}
                value={(field.value as string) || null}
                onChange={field.onChange}
                onBlur={field.onBlur}
                options={options}
                placeholder={field.placeholder}
                aria-label={t('sales.creditNote.apply.invoice')}
                invalid={field.invalid}
              />
            )}
          </UbField>
          <UbField
            name="amount"
            label={t('sales.creditNote.apply.amount')}
            placeholder={t('sales.payment.amount')}
            required
          >
            {(field) => <UbMoneyInput {...field} />}
          </UbField>
        </UbForm>
      )}
    </UbDialog>
  );
}
