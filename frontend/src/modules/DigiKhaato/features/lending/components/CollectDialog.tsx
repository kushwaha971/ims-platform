'use client';

import { useEffect, useId, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import { CompactCard } from 'src/components/records/CompactCard';
import { CompactDialog } from 'src/components/records/CompactOverlays';
import {
  UbButton,
  UbChoiceChips,
  UbDateInput,
  UbField,
  UbForm,
  UbMoneyInput,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { formatBusinessDate, todayInTenantTz } from 'src/utils/dates';
import { formatInr, sumMoney } from 'src/utils/money';

import { selectLendingForm } from '../redux/lendingFormSlice';
import { collectLendingLoan, previewLendingCollection } from '../redux/lendingThunk';
import {
  PAYMENT_MODES,
  type CollectFormValues,
  type CollectionPreview,
  type LendingPaymentMode,
} from '../types/lending.types';
import { useLendingSchemas } from '../validation/lendingSchemas';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/lending';
import 'src/i18n/catalogues/validation';

const PREVIEW_DEBOUNCE_MS = 350;

/**
 * The collect sheet (FRD LEN-06; owner, 4 Oct 2026): ANY amount — part,
 * exact, or several days together after a gap. Before saving it says what the
 * amount clears ("2 missed days, today and 1 day ahead") and what is left, so
 * the agent and the borrower agree on it at the door. Mode, reference and a
 * note go on the receipt.
 */
export function CollectDialog({
  loanId,
  name,
  number,
  suggested,
  onClose,
  loanSelector,
  onSaved,
}: Readonly<{
  loanId: string;
  name: string;
  number: string;
  suggested: string;
  onClose: () => void;
  loanSelector?: React.ReactNode;
  onSaved?: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const formId = useId();
  const { saving } = useAppSelector(selectLendingForm);
  const { key, rotate } = useIdempotencyKey();
  const { collectSchema } = useLendingSchemas();
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);
  const form = useForm<CollectFormValues>({
    resolver: yupResolver(collectSchema),
    mode: 'onTouched',
    defaultValues: {
      amount: Number(suggested) > 0 ? suggested : '',
      mode: 'cash',
      reference: '',
      note: '',
      collectedOn: today,
    },
  });
  const [amount, mode] = useWatch({ control: form.control, name: ['amount', 'mode'] });
  const [preview, setPreview] = useState<CollectionPreview | null>(null);
  const [refusal, setRefusal] = useState('');

  useEffect(() => {
    if (!amount || !(Number(amount) > 0)) return undefined;
    let request: { abort: () => void } | null = null;
    let live = true;
    const id = window.setTimeout(() => {
      const pending = dispatch(previewLendingCollection({ loanId, amount }));
      request = pending;
      void pending.then((result) => {
        if (!live) return;
        if (previewLendingCollection.fulfilled.match(result)) {
          setPreview(result.payload);
          setRefusal('');
        } else if (!result.meta.aborted) {
          setPreview(null);
          setRefusal(result.payload?.message ?? '');
        }
      });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(id);
      request?.abort();
    };
  }, [amount, dispatch, loanId]);

  const save = async (values: CollectFormValues) => {
    const result = await dispatch(collectLendingLoan({ loanId, values, key }));
    rotate();
    if (collectLendingLoan.fulfilled.match(result)) {
      dispatch(
        showSnackbar({
          severity: 'success',
          id:
            result.payload.loanStatus === 'closed'
              ? 'lending.collect.doneClosed'
              : 'lending.collect.done',
          params: {
            amount: formatInr(result.payload.amount),
            name,
            receipt: result.payload.receiptNumber,
          },
        })
      );
      onSaved?.();
      onClose();
    } else if (result.payload) {
      form.setError('amount', { message: result.payload.message });
    }
  };

  const groups = preview
    ? (['missed', 'today', 'ahead'] as const)
        .map((when) => ({ when, rows: preview.clears.filter((c) => c.when === when) }))
        .filter((g) => g.rows.length > 0)
    : [];

  return (
    <CompactDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('lending.collect.title', { name })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton type="submit" form={formId} busy={saving} data-testid="lending-collect-save">
            {t('lending.collect.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={save}>
        {loanSelector}
        {!loanSelector && (
          <UbText variant="caption" tone="tertiary">
            {number}
          </UbText>
        )}
        <UbField
          name="amount"
          label={t('lending.collect.amount')}
          hint={t('lending.collect.amount.hint')}
          required
          placeholder="0.00"
        >
          {(field) => (
            <UbMoneyInput
              {...field}
              value={field.value as string}
              onChange={(next) => {
                field.onChange(next);
                setPreview(null);
                setRefusal('');
              }}
              inputMode="decimal"
              disabled={saving}
            />
          )}
        </UbField>
        {preview && (
          <CompactCard padded>
            <UbStack gap={1} data-testid="lending-collect-clears">
              <UbText variant="body-sm-medium">{t('lending.collect.clears')}</UbText>
              {groups.map((g) => (
                <UbText key={g.when} variant="body-sm" tone="secondary">
                  {t(`lending.collect.when.${g.when}`, {
                    count: g.rows.length,
                    amount: formatInr(sumMoney(g.rows.map((r) => r.amount))),
                    date: formatBusinessDate(g.rows[0]?.dueOn ?? ''),
                  })}
                </UbText>
              ))}
              <UbText variant="body-sm">
                {t('lending.collect.leftAfter', { amount: formatInr(preview.remainingAfter) })}
              </UbText>
            </UbStack>
          </CompactCard>
        )}
        {refusal && !form.formState.errors.amount && (
          <UbText variant="body-sm" tone="warning">
            {refusal}
          </UbText>
        )}
        <UbField name="mode" label={t('lending.collect.mode')} controlOwnsLabel>
          {(field) => (
            // The chips carry no visible label of their own (controlOwnsLabel):
            // without this line the collector saw four bare chips (L02 QA).
            <UbStack gap={1}>
              <UbText variant="body-sm-medium">{t('lending.collect.mode')}</UbText>
              <UbChoiceChips<LendingPaymentMode>
                id={field.id}
                ariaLabel={t('lending.collect.mode')}
                value={field.value as LendingPaymentMode}
                onChange={(next) => field.onChange(next)}
                onBlur={field.onBlur}
                options={PAYMENT_MODES.map((m) => ({ value: m, label: t(`lending.mode.${m}`) }))}
                disabled={saving}
              />
            </UbStack>
          )}
        </UbField>
        {mode !== 'cash' && (
          <UbField
            name="reference"
            label={t('lending.collect.reference')}
            placeholder={t('lending.collect.reference.placeholder')}
            optionalLabel={t('common.field.optional')}
          >
            {(field) => <UbTextInput {...field} autoComplete="off" disabled={saving} />}
          </UbField>
        )}
        {/* QA B45 — money taken yesterday is recorded on yesterday, not as today's cash. */}
        <UbField
          name="collectedOn"
          label={t('lending.collect.on')}
          hint={t('lending.collect.on.hint')}
        >
          {(field) => (
            <UbDateInput {...field} value={field.value as string} max={today} disabled={saving} />
          )}
        </UbField>
        <UbField
          name="note"
          label={t('lending.collect.note')}
          placeholder={t('lending.collect.note.placeholder')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbTextInput {...field} autoComplete="off" disabled={saving} />}
        </UbField>
      </UbForm>
    </CompactDialog>
  );
}
