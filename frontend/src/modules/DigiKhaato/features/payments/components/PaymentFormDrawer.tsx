'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbActionLink,
  UbButton,
  UbChoiceChips,
  UbDateInput,
  UbDrawer,
  UbField,
  UbForm,
  UbSectionHeading,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import { PAYMENT_MODES, type PaymentMode } from 'src/types/domain.types';
import { todayInTenantTz } from 'src/utils/dates';
import { formatAmount } from 'src/utils/money';

import { ExpensePartyField } from '../../expenses/components/ExpensePartyField';
import { LAST_MODE_KEY } from '../constants/paymentConstants';
import { usePaymentForm } from '../hooks/usePaymentForm';
import { usePaymentSchemas } from '../validation/paymentSchemas';
import { allocationRowsFor, defaultAmount, linesTotal } from '../view-model/paymentDisplay';

import { PaymentAllocationPicker } from './PaymentAllocationPicker';
import { PaymentModeEditor } from './PaymentModeEditor';

import type {
  PaymentContext,
  PaymentDirection,
  PaymentFormValues,
  PaymentSaveResult,
} from '../types/payment.types';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/ledger';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/partyPicker';
import 'src/i18n/catalogues/paymentActions';
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/validation';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).

const DAY_MS = 86_400_000;

/**
 * PAY-01 FR-2 — "Record payment · Ramesh Traders": who, when, how (PAY-02's
 * mode lines), and which bills it settles (the allocation picker), in one
 * drawer that every entry point opens — the payments list, the khata's ⋯
 * menu, an invoice page, and the Collect sheet's "Mark received".
 *
 * Loaded with `dynamic()` by every opener: it carries React Hook Form's
 * resolver, the Yup schema and the payments slices, and a merchant reading a
 * khata should not download them (CLAUDE.md, the +58.6 KB lesson).
 *
 * After a save the drawer shows what was written — the receipt number and a
 * link to the receipt page, where it prints and shares (PAY-04 FR-3) — rather
 * than vanishing: the global snackbar has no action slot yet, and "Print" is
 * the next thing a counter does.
 */
export function PaymentFormDrawer({
  context,
  onClose,
  onSaved,
}: Readonly<{
  context: PaymentContext;
  onClose: () => void;
  onSaved?: (result: PaymentSaveResult) => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { paymentSchema } = usePaymentSchemas();
  const formId = useId();
  const timezone = useAppSelector(selectTenantTimezone);
  const payment = usePaymentForm(context);
  const { canWrite, isSaving, formErrors, openDocuments, openStatus, loadOpenDocuments, submit } =
    payment;
  const [saved, setSaved] = useState<PaymentSaveResult | null>(null);

  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);
  const yesterday = useMemo(
    () => new Date(Date.parse(`${today}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10),
    [today]
  );

  const defaults = useMemo<PaymentFormValues>(() => {
    const amount = context.presetAmount ?? defaultAmount(context.documentDue, context.receivable);
    const lines = context.presetLines?.length
      ? context.presetLines.map((line) => ({
          mode: line.mode,
          upiApp: line.upiApp ?? ('' as const),
          amount: line.amount,
          reference: line.reference,
        }))
      : [{ mode: context.presetMode ?? lastMode(), upiApp: '' as const, amount, reference: '' }];
    return {
      direction: context.direction,
      partyId: context.partyId ?? '',
      partyName: context.partyName ?? '',
      paymentDate: today,
      lines,
      // An invoice or bill page pays THAT bill; everywhere else FIFO is the default (FR-5).
      autoAllocate: !context.documentId,
      allocations: [],
      note: '',
    };
  }, [context, today]);

  const form = useForm<PaymentFormValues>({
    resolver: yupResolver(paymentSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });
  const { setError, setValue, formState } = form;
  const direction = useWatch({ control: form.control, name: 'direction' });
  const partyId = useWatch({ control: form.control, name: 'partyId' });
  const partyName = useWatch({ control: form.control, name: 'partyName' });
  const lines = useWatch({ control: form.control, name: 'lines' });
  const total = linesTotal(lines ?? []);

  /* The rows the manual panel edits follow the open bills the server listed,
     with the invoice page's own bill preset to its due (FR-1). */
  useEffect(() => {
    setValue(
      'allocations',
      allocationRowsFor(
        openDocuments,
        context.documentId
          ? { documentId: context.documentId, amount: context.documentDue ?? total }
          : undefined
      )
    );
    // `total` deliberately excluded: re-seeding on every keystroke would erase typed rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDocuments, context.documentId, context.documentDue, setValue]);

  const handleSubmit = useCallback(
    async (values: PaymentFormValues) => {
      if (values.lines[0]?.mode) rememberMode(values.lines[0].mode);
      const result = await submit(values, setError);
      if (result) {
        setSaved(result);
        onSaved?.(result);
      }
    },
    [submit, setError, onSaved]
  );

  const directions = useMemo(
    () =>
      (['in', 'out'] as const).map((value) => ({
        value,
        label: t(`payments.direction.${value}`),
      })),
    [t]
  );

  /* PUR-02 — money out is "Pay supplier", in the words of the button that opened it. */
  const out = direction === 'out';
  const title = partyName
    ? t(out ? 'payments.record.titleOutFor' : 'payments.record.titleFor', { name: partyName })
    : t(out ? 'payments.record.titleOut' : 'payments.record.title');

  if (saved) {
    return (
      <UbDrawer
        open
        onOpenChange={(next) => !next && onClose()}
        title={title}
        closeLabel={t('common.action.close')}
        footer={
          <>
            <UbButton variant="secondary" onClick={onClose}>
              {t('payments.saved.done')}
            </UbButton>
            <UbActionLink href={`${ROUTES.PAYMENTS}/${saved.payment.id}`}>
              {t('payments.receipt.view')}
            </UbActionLink>
          </>
        }
      >
        <UbStack gap={3} data-testid="payment-saved">
          <UbStatusBanner
            tone="success"
            title={t(saved.payment.direction === 'in' ? 'payments.saved' : 'payments.savedOut', {
              amount: formatAmount(saved.payment.amount),
              number: saved.payment.number,
            })}
            description={
              saved.payment.unallocatedAmount !== '0.00'
                ? t('payments.advance', { amount: formatAmount(saved.payment.unallocatedAmount) })
                : undefined
            }
          />
        </UbStack>
      </UbDrawer>
    );
  }

  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={title}
      closeLabel={t('common.action.close')}
      dismissOnBackdrop={!formState.isDirty}
      footer={
        <UbButton
          type="submit"
          form={formId}
          busy={isSaving}
          busyLabel={t('payments.saving')}
          disabled={!canWrite}
          data-testid="payment-save"
        >
          {t('payments.save', { amount: formatAmount(total) })}
        </UbButton>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={formErrors}>
        {!canWrite && <UbStatusBanner tone="info" title={t('payments.readOnly')} />}

        {context.entry === 'list' && (
          <UbChoiceChips<PaymentDirection>
            ariaLabel={t('payments.direction.label')}
            value={direction}
            options={directions}
            onChange={(next) => {
              setValue('direction', next, { shouldDirty: true });
              if (partyId) loadOpenDocuments(partyId, next);
            }}
          />
        )}

        {!context.partyId && (
          <UbField
            name="partyId"
            label={direction === 'in' ? t('payments.party.from') : t('payments.party.to')}
            placeholder={t('expenses.paidTo.placeholder')}
            required
          >
            {(field) => (
              <ExpensePartyField
                field={field}
                partyName={partyName}
                t={t}
                onPick={(id, name) => {
                  field.onChange(id);
                  setValue('partyName', name, { shouldDirty: true });
                  if (id) loadOpenDocuments(id, direction);
                }}
              />
            )}
          </UbField>
        )}

        <UbStack gap={2}>
          <UbSectionHeading title={t('payments.mode.heading')} />
          <PaymentModeEditor
            form={form}
            target={context.documentDue ?? context.receivable ?? total}
            t={t}
            disabled={!canWrite}
          />
        </UbStack>

        <UbField
          name="paymentDate"
          label={t('payments.date')}
          placeholder={t('ledger.entry.date.placeholder')}
          required
        >
          {(field) => (
            <UbDateInput
              {...field}
              max={today}
              quickChoicesLabel={t('ledger.entry.date.quick')}
              quickChoices={[
                { label: t('ledger.entry.date.today'), date: today },
                { label: t('ledger.entry.date.yesterday'), date: yesterday },
              ]}
            />
          )}
        </UbField>

        {partyId && (
          <UbStack gap={2}>
            <UbSectionHeading title={t('payments.alloc.heading')} />
            <PaymentAllocationPicker
              form={form}
              documents={openDocuments}
              status={openStatus}
              t={t}
              disabled={!canWrite}
            />
          </UbStack>
        )}

        <UbField
          name="note"
          label={t('payments.note')}
          placeholder={t('payments.note.placeholder')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbTextInput {...field} autoComplete="off" maxLength={255} />}
        </UbField>
        {direction === 'out' && (
          <UbText variant="caption" tone="tertiary">
            {t('payments.out.hint')}
          </UbText>
        )}
      </UbForm>
    </UbDrawer>
  );
}

/**
 * PAY-02 §8 — the first line's mode is the one this device used last.
 * `localStorage`, wrapped: it throws in a private window, and a drawer that
 * fails to open because a preference could not be read is a poor trade.
 */
const lastMode = (): PaymentMode | '' => {
  try {
    const stored = window.localStorage.getItem(LAST_MODE_KEY);
    return PAYMENT_MODES.includes(stored as never) ? (stored as PaymentMode) : 'cash';
  } catch {
    return 'cash';
  }
};

const rememberMode = (mode: string): void => {
  try {
    window.localStorage.setItem(LAST_MODE_KEY, mode);
  } catch {
    /* A preference that cannot be stored is not worth a failed save. */
  }
};
