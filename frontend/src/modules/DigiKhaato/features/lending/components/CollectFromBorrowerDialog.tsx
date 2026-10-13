'use client';

import { useEffect, useId, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbAmount,
  UbButton,
  UbCard,
  UbChoiceChips,
  UbDateInput,
  UbDialog,
  UbField,
  UbForm,
  UbListItemText,
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
import { todayInTenantTz } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { selectLendingForm } from '../redux/lendingFormSlice';
import { collectFromBorrower, previewBorrowerCollection } from '../redux/lendingThunk';
import {
  PAYMENT_MODES,
  type BorrowerSplit,
  type BorrowerSplitLoan,
  type CollectFormValues,
  type LendingPaymentMode,
} from '../types/lending.types';
import { useLendingSchemas } from '../validation/lendingSchemas';
import { splitFromRefusal } from '../view-model/borrowerSplit';
import { isNonZero } from '../view-model/lendingDisplay';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/lending';
import 'src/i18n/catalogues/validation';

const PREVIEW_DEBOUNCE_MS = 350;

/** What one loan's share does, in the words a collector says at the door. */
function shareCaption(
  row: BorrowerSplitLoan,
  t: (id: string, params?: Record<string, string | number>) => string
): string {
  const share = Number(row.amount);
  const due = Number(row.dueNow);
  if (due <= 0) return t('lending.collectFrom.ahead');
  if (share === due) return t('lending.collectFrom.clearsDueNow');
  if (share < due) return t('lending.collectFrom.ofDueNow', { due: formatInr(row.dueNow) });
  return t('lending.collectFrom.dueNowAndAhead', {
    due: formatInr(row.dueNow),
    ahead: formatInr((share - due).toFixed(2)),
  });
}

/**
 * "Collect from Geeta" (review L5; the approved design, 12 Oct 2026). One cash
 * handover for a person with several running loans: one amount, split by the
 * server — what is due now first, the oldest instalment first, then ahead —
 * and SHOWN loan by loan before anything is saved. Saving records one ordinary
 * collection per loan, each with its own receipt.
 *
 * The split saved is the split shown: the sheet sends it back, and if a
 * collection on one of the loans changed it meanwhile the server refuses with
 * the new one, which the sheet puts in its place and says so. Save waits for a
 * split that matches the amount in the box.
 */
export function CollectFromBorrowerDialog({
  borrowerId,
  name,
  onClose,
}: Readonly<{ borrowerId: string; name: string; onClose: () => void }>): React.JSX.Element {
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
    defaultValues: { amount: '', mode: 'cash', reference: '', note: '', collectedOn: today },
  });
  const [amount, mode] = useWatch({ control: form.control, name: ['amount', 'mode'] });
  const [split, setSplit] = useState<BorrowerSplit | null>(null);
  const [refusal, setRefusal] = useState('');
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (!amount || !(Number(amount) > 0)) return undefined;
    let request: { abort: () => void } | null = null;
    let live = true;
    const id = window.setTimeout(() => {
      const pending = dispatch(previewBorrowerCollection({ borrowerId, amount }));
      request = pending;
      void pending.then((result) => {
        if (!live) return;
        if (previewBorrowerCollection.fulfilled.match(result)) {
          setSplit(result.payload);
          setRefusal('');
        } else if (!result.meta.aborted) {
          setSplit(null);
          setRefusal(result.payload?.message ?? '');
        }
      });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(id);
      request?.abort();
    };
  }, [amount, dispatch, borrowerId]);

  // The split on screen must be the split of the amount in the box.
  const current =
    split && amount && Number(split.amount) === Number(amount) && !refusal ? split : null;
  const shares = current ? current.loans.filter((row) => isNonZero(row.amount)) : [];

  const save = async (values: CollectFormValues) => {
    if (!current) return;
    const result = await dispatch(collectFromBorrower({ split: current, values, key }));
    rotate();
    if (collectFromBorrower.fulfilled.match(result)) {
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'lending.collectFrom.done',
          params: {
            amount: formatInr(result.payload.amount),
            name,
            count: result.payload.receipts.length,
          },
        })
      );
      onClose();
      return;
    }
    const fresh =
      result.payload?.code === 'balance_changed' ? splitFromRefusal(result.payload.details) : null;
    if (fresh) {
      setSplit(fresh);
      setChanged(true);
    } else if (result.payload) {
      form.setError('amount', { message: result.payload.message });
    }
  };

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('lending.collectFrom.title', { name })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={saving}
            disabled={!current}
            data-testid="lending-collect-from-save"
          >
            {current
              ? t('lending.collectFrom.save', { count: shares.length })
              : t('lending.collect.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={save}>
        <UbText variant="body-sm" tone="secondary">
          {t('lending.collectFrom.hint', { name })}
        </UbText>
        <UbField name="amount" label={t('lending.collect.amount')} required placeholder="0.00">
          {(field) => (
            <UbMoneyInput
              {...field}
              value={field.value as string}
              onChange={(next) => {
                setChanged(false);
                field.onChange(next);
              }}
              inputMode="decimal"
              disabled={saving}
            />
          )}
        </UbField>
        {current && (
          <UbCard padded>
            <UbStack gap={2} data-testid="lending-collect-from-split">
              <UbText variant="body-sm-medium">{t('lending.collectFrom.split')}</UbText>
              {changed && (
                <UbText variant="body-sm" tone="warning" role="status">
                  {t('lending.collectFrom.changed')}
                </UbText>
              )}
              <UbStack as="ul" gap={0}>
                {shares.map((row) => (
                  <UbStack
                    as="li"
                    key={row.loanId}
                    direction="row"
                    justify="between"
                    align="start"
                    gap={3}
                    className="border-b border-border-hairline py-2 last:border-b-0"
                  >
                    <UbListItemText
                      primary={row.number}
                      secondary={[
                        shareCaption(row, t),
                        t('lending.collectFrom.loanLeft', { amount: formatInr(row.leftAfter) }),
                      ].join(' · ')}
                    />
                    <UbAmount value={row.amount} className="shrink-0" />
                  </UbStack>
                ))}
              </UbStack>
              <UbText variant="body-sm">
                {t('lending.collectFrom.leftAfter', { amount: formatInr(current.leftAfter) })}
              </UbText>
            </UbStack>
          </UbCard>
        )}
        {refusal && (
          <UbText variant="body-sm" tone="warning">
            {refusal}
          </UbText>
        )}
        <UbField name="mode" label={t('lending.collect.mode')} controlOwnsLabel>
          {(field) => (
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
        {/* QA B45 — the day the money was really taken, for every loan's share. */}
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
    </UbDialog>
  );
}
