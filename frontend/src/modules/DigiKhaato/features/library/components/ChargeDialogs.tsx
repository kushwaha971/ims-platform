'use client';

import { useId, useMemo, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import * as Yup from 'yup';

import {
  UbButton,
  UbChoiceChips,
  UbField,
  UbForm,
  UbMoneyInput,
  UbStack,
  UbText,
  UbTextArea,
  UbTextInput,
} from 'src/design-system';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';
import { readDetailString } from 'src/utils/errorDetails';
import { addMoney, formatInr, isNegativeAmount, moneyOrZero, subtractMoney } from 'src/utils/money';
import { REASON_MAX_CHARS, hasReason } from 'src/utils/reason';

import {
  MANUAL_CHARGE_KINDS,
  type ChargeRow,
  type ManualChargeFormValues,
  type ManualChargeKind,
  type WaiveFormValues,
} from '../types/charge.types';

import { LibraryDialog } from './LibraryOverlays';

import type { ChargeOutcome } from '../hooks/useMemberCharges';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/validation';

/** What the member will owe after a change, never negative — said before Save (Part 17.0.3). */
const after = (dues: string, change: string, direction: 'add' | 'take'): string => {
  const typed = moneyOrZero(change);
  const next = direction === 'add' ? addMoney(dues, typed) : subtractMoney(dues, typed);
  return isNegativeAmount(next) ? '0.00' : next;
};

/**
 * F06 (LIB-07 FR-3, §8) — waive some or all of what is owed on one charge. The
 * dialog states the consequence before confirming, and a waiver above the
 * staff ceiling is refused INLINE ("Waivers above ₹100 need the owner or an
 * admin"), so the typed reason stays where it is.
 */
export function WaiveChargeDialog({
  charge,
  dues,
  busy,
  onClose,
  onSubmit,
}: Readonly<{
  charge: ChargeRow;
  dues: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: WaiveFormValues) => Promise<ChargeOutcome>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const v = useValidationSchemas();
  const formId = useId();
  const [failure, setFailure] = useState<string | null>(null);
  const schema = useMemo(
    () =>
      Yup.object({
        amount: v
          .amountValidation({ max: charge.amountDue })
          .test(
            'due',
            t('library.charge.waive.overDue', { amount: formatInr(charge.amountDue) }),
            (value) => Number(value) <= Number(charge.amountDue)
          ),
        reason: v.reasonText('library.member.reason.required'),
      }) as Yup.ObjectSchema<WaiveFormValues>,
    [v, t, charge.amountDue]
  );
  const form = useForm<WaiveFormValues>({
    resolver: yupResolver(schema),
    mode: 'onTouched',
    defaultValues: { amount: charge.amountDue, reason: '' },
  });
  const amount = useWatch({ control: form.control, name: 'amount' });

  return (
    <LibraryDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.charge.waive.title')}
      description={charge.description}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton type="submit" form={formId} busy={busy} busyLabel={t('library.working')}>
            {t('library.charge.waiveAction')}
          </UbButton>
        </>
      }
    >
      <UbForm
        id={formId}
        form={form}
        formErrors={failure ? [failure] : undefined}
        onSubmit={async (values) => {
          setFailure(null);
          const outcome = await onSubmit({
            amount: String(values.amount ?? '').trim(),
            reason: String(values.reason ?? '').trim(),
          });
          if (outcome.ok) {
            onClose();
            return;
          }
          const error = outcome.error;
          if (error?.code === 'library_waiver_over_ceiling') {
            setFailure(
              t('library.charge.waive.ceiling', {
                amount: formatInr(readDetailString(error.details, 'ceiling') ?? '0'),
              })
            );
          } else {
            setFailure(error?.message ?? null);
          }
        }}
      >
        <UbText variant="body-sm" tone="secondary">
          {t('library.charge.waive.body')}
        </UbText>
        <UbField name="amount" label={t('library.charge.waive.amount')} required placeholder="0.00">
          {(field) => (
            <UbMoneyInput
              {...field}
              value={field.value as string}
              onChange={field.onChange}
              inputMode="decimal"
              disabled={busy}
            />
          )}
        </UbField>
        <UbField name="reason" label={t('library.member.reason')} required>
          {(field) => (
            <UbTextArea {...field} rows={2} maxLength={REASON_MAX_CHARS} disabled={busy} />
          )}
        </UbField>
        <UbText variant="body-sm" tone="secondary" data-testid="charge-waive-after">
          {t('library.charge.duesAfter', {
            amount: formatInr(after(dues, amount, 'take')),
          })}
        </UbText>
      </UbForm>
    </LibraryDialog>
  );
}

/**
 * F06 (LIB-07 FR-8) — a charge made in error is reversed with a reason; a
 * charge with payments against it is refused, and the dialog says so in place.
 */
export function ReverseChargeDialog({
  charge,
  busy,
  onClose,
  onSubmit,
}: Readonly<{
  charge: ChargeRow;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<ChargeOutcome>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const send = async () => {
    if (!hasReason(reason)) {
      setFailure(t('library.member.reason.required'));
      return;
    }
    const outcome = await onSubmit(reason.trim());
    if (outcome.ok) onClose();
    else
      setFailure(
        outcome.error?.code === 'library_charge_has_payments'
          ? t('library.charge.reverse.hasPayments')
          : (outcome.error?.message ?? null)
      );
  };

  return (
    <LibraryDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.charge.reverse.title')}
      description={charge.description}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy} autoFocus>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            variant="destructive"
            onClick={() => void send()}
            busy={busy}
            busyLabel={t('library.working')}
          >
            {t('library.charge.reverse')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={3}>
        <UbText variant="body-sm" tone="secondary">
          {t('library.charge.reverse.body', { amount: formatInr(charge.amount) })}
        </UbText>
        <UbTextInput
          id="library-reverse-reason"
          name="library-reverse-reason"
          aria-label={t('library.member.reason')}
          placeholder={t('library.charge.reverse.placeholder')}
          value={reason}
          onChange={setReason}
          maxLength={REASON_MAX_CHARS}
          invalid={!!failure}
        />
        {failure && (
          <UbText variant="body-sm" tone="formError">
            {failure}
          </UbText>
        )}
      </UbStack>
    </LibraryDialog>
  );
}

/**
 * F06 (LIB-07 FR-2) — a processing fee or another one-off charge, with the
 * consequence ("They will owe ₹262") said before Save.
 */
export function ManualChargeDialog({
  dues,
  busy,
  onClose,
  onSubmit,
}: Readonly<{
  dues: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: ManualChargeFormValues, key: string) => Promise<ChargeOutcome>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const v = useValidationSchemas();
  const formId = useId();
  const { key, rotate } = useIdempotencyKey();
  const [failure, setFailure] = useState<string | null>(null);
  const schema = useMemo(
    () =>
      Yup.object({
        kind: v.enumValidation(MANUAL_CHARGE_KINDS, 'library.settings.choose'),
        amount: v.amountValidation(),
        description: v.reasonText('library.charge.description.required'),
      }) as Yup.ObjectSchema<ManualChargeFormValues>,
    [v]
  );
  const form = useForm<ManualChargeFormValues>({
    resolver: yupResolver(schema),
    mode: 'onTouched',
    defaultValues: { kind: 'processing', amount: '', description: '' },
  });
  const amount = useWatch({ control: form.control, name: 'amount' });
  const options = useMemo(
    () => MANUAL_CHARGE_KINDS.map((value) => ({ value, label: t(`library.charge.kind.${value}`) })),
    [t]
  );

  return (
    <LibraryDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.charge.add')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton type="submit" form={formId} busy={busy} busyLabel={t('library.working')}>
            {t('library.charge.add')}
          </UbButton>
        </>
      }
    >
      <UbForm
        id={formId}
        form={form}
        formErrors={failure ? [failure] : undefined}
        onSubmit={async (values) => {
          const outcome = await onSubmit(
            {
              kind: values.kind,
              amount: String(values.amount ?? '').trim(),
              description: String(values.description ?? '').trim(),
            },
            key
          );
          rotate();
          if (outcome.ok) onClose();
          else setFailure(outcome.error?.message ?? null);
        }}
      >
        <UbField name="kind" label={t('library.charge.kind')} required controlOwnsLabel>
          {(field) => (
            <UbChoiceChips<ManualChargeKind>
              id={field.id}
              ariaLabel={t('library.charge.kind')}
              value={field.value as ManualChargeKind}
              onChange={(next) => field.onChange(next)}
              onBlur={field.onBlur}
              options={options}
              disabled={busy}
            />
          )}
        </UbField>
        <UbField name="amount" label={t('library.charge.amount')} required placeholder="0.00">
          {(field) => (
            <UbMoneyInput
              {...field}
              value={field.value as string}
              onChange={field.onChange}
              inputMode="decimal"
              disabled={busy}
            />
          )}
        </UbField>
        <UbField
          name="description"
          label={t('library.charge.description')}
          placeholder={t('library.charge.description.placeholder')}
          required
        >
          {(field) => <UbTextInput {...field} maxLength={REASON_MAX_CHARS} disabled={busy} />}
        </UbField>
        <UbText variant="body-sm" tone="secondary">
          {t('library.charge.duesAfter', {
            amount: formatInr(after(dues, amount, 'add')),
          })}
        </UbText>
      </UbForm>
    </LibraryDialog>
  );
}

/**
 * F06 (LIB-07 FR-4) — a book the member has lost: the fine to today (the
 * server's calculation, never recomputed here) and then the book's cost are
 * charged, and the copy is marked lost. The dialog shows the fine before the
 * librarian confirms; the cost is the server's rule (price × multiplier +
 * processing), said in the row afterwards.
 */
export function MarkLostDialog({
  title,
  fine,
  busy,
  onClose,
  onSubmit,
}: Readonly<{
  title: string;
  fine: { amount: string; daysLate: number } | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<ChargeOutcome>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <LibraryDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.charge.lost.title')}
      description={title}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy} autoFocus>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            variant="destructive"
            busy={busy}
            busyLabel={t('library.working')}
            data-testid="library-lost-confirm"
            onClick={async () => {
              const outcome = await onSubmit(reason.trim());
              if (outcome.ok) onClose();
              else setFailure(outcome.error?.message ?? null);
            }}
          >
            {t('library.charge.lost.confirm')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={3}>
        <UbText variant="body-sm" tone="secondary">
          {fine && Number(fine.amount) > 0
            ? t('library.charge.lost.withFine', {
                days: fine.daysLate,
                amount: formatInr(fine.amount),
              })
            : t('library.charge.lost.body')}
        </UbText>
        <UbTextInput
          id="library-lost-reason"
          name="library-lost-reason"
          aria-label={t('library.member.reason')}
          placeholder={t('library.charge.lost.placeholder')}
          value={reason}
          onChange={setReason}
          maxLength={REASON_MAX_CHARS}
        />
        {failure && (
          <UbText variant="body-sm" tone="formError">
            {failure}
          </UbText>
        )}
      </UbStack>
    </LibraryDialog>
  );
}
