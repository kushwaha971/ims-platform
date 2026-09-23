'use client';

import { useCallback, useEffect, useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbDateInput,
  UbDrawer,
  UbField,
  UbForm,
  UbMoneyInput,
  UbRadioGroup,
  UbSelect,
  UbStatusBanner,
  UbTextInput,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { PAYMENT_MODES } from 'src/types/domain.types';
import { todayInTenantTz } from 'src/utils/dates';

import { useLedgerSchemas } from '../validation/ledgerSchemas';

import type { UseEntryCorrectionResult } from '../hooks/useEntryCorrection';
import type { LedgerCorrectionFormValues, LedgerDirection } from '../types/ledger.types';

/**
 * LED-03 FR-3 — the drawer a merchant fixes a wrong entry in.
 *
 * ── Why it opens on the ORIGINAL's values ─────────────────────────────────
 * Because a correction is an edit in the merchant's head, whatever it is in the
 * database. They typed 500 and meant 550; the screen that helps them shows 500
 * with the cursor in it. An empty form would make them retype an amount, a
 * date, a note and a reference to change one digit — and every field they
 * retyped would be a field they could newly get wrong.
 *
 * What the SERVICE sends is still only what changed (see `toCorrectionBody`),
 * so the audit row's `changed_fields` names one field rather than six.
 *
 * ── Why the entry type is not a control ───────────────────────────────────
 * BR-3 decides it, server-side, from the direction: a "You got" corrected into
 * a "You gave" becomes a `manual_gave`, and an opening stays an opening. There
 * is no version of this form where a merchant should be choosing between
 * `manual_gave` and `opening` — those are the ledger's words for what they
 * already said by picking a direction.
 *
 * ── Why an opening balance loses two fields ───────────────────────────────
 * An opening has no payment mode and its note is the server's fixed English
 * "Opening balance" (LED-02 BR-1). Showing either would offer to edit something
 * the server will ignore, which is worse than not offering it: a merchant who
 * types a note and sees it vanish has learned the app loses their work.
 */
const DAY_MS = 86_400_000;

export function LedgerCorrectionDrawer({
  correction,
}: Readonly<{ correction: UseEntryCorrectionResult }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const { ledgerCorrectionSchema } = useLedgerSchemas();
  const formId = useId();
  const timezone = useAppSelector(selectTenantTimezone);
  const { correcting, isSaving, canCorrect, formErrors, close, submitCorrect } = correction;

  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);
  const yesterday = useMemo(
    () => new Date(Date.parse(`${today}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10),
    [today]
  );

  const defaults = useMemo<LedgerCorrectionFormValues>(
    () => ({
      direction: correcting?.direction ?? 'debit',
      amount: correcting?.amount ?? '',
      entryDate: correcting?.entryDate ?? today,
      note: correcting?.note ?? '',
      paymentMode: correcting?.paymentMode ?? '',
      reference: correcting?.reference ?? '',
      // Never prefilled. The reason is about THIS correction, and a remembered
      // one would be last week's answer attached to today's change.
      reason: '',
    }),
    [correcting, today]
  );

  const form = useForm<LedgerCorrectionFormValues>({
    resolver: yupResolver(ledgerCorrectionSchema),
    mode: 'onTouched',
    defaultValues: defaults,
  });
  const { reset, setError, formState } = form;

  /* Keyed on the ENTRY's id rather than on `open`, because this drawer is
     opened straight from one row onto another: the ⋯ menu of a second entry
     can be reached without the drawer closing in between, and a reset that only
     ran on open would leave the first entry's amount in front of the merchant
     under the second entry's title. */
  useEffect(() => {
    if (correcting) reset(defaults);
  }, [correcting?.id, reset, defaults, correcting]);

  const watchedDirection = useWatch({ control: form.control, name: 'direction' });
  const isCredit = watchedDirection === 'credit';
  const isOpening = correcting?.entryType === 'opening';

  const directionOptions = useMemo(
    () =>
      isOpening
        ? [
            /* An opening's direction is the question LED-02's form asks in these
               words — "They owe me" / "I owe them" — because nothing was given
               or got on that date; it is the position the book started from. A
               correction that relabelled them "You gave" and "You got" would be
               asking a different question about the same row. */
            { value: 'debit' as const, label: t('ledger.opening.theyOwe') },
            { value: 'credit' as const, label: t('ledger.opening.iOwe') },
          ]
        : [
            { value: 'debit' as const, label: t('ledger.entry.gave') },
            { value: 'credit' as const, label: t('ledger.entry.got') },
          ],
    [t, isOpening]
  );

  const modeOptions = useMemo(
    () => PAYMENT_MODES.map((mode) => ({ value: mode, label: t(`ledger.mode.${mode}`) })),
    [t]
  );

  const handleSubmit = useCallback(
    async (values: LedgerCorrectionFormValues) => {
      await submitCorrect(values, setError);
    },
    [submitCorrect, setError]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) close();
    },
    [close]
  );

  if (!correcting) return null;

  return (
    <UbDrawer
      open
      onOpenChange={handleOpenChange}
      title={t('ledger.correction.title')}
      closeLabel={t('common.action.close')}
      dismissOnBackdrop={!formState.isDirty}
      footer={
        <>
          <UbButton variant="secondary" onClick={close} disabled={isSaving}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={isSaving}
            busyLabel={t('ledger.correction.saving')}
            disabled={!canCorrect}
          >
            {t('ledger.correction.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={formErrors}>
        {/* What is about to happen, before the fields. A merchant who thinks
            this edits the line in place will be surprised by three rows in
            their khata; one who has been told will not, and the sentence is
            the only place the product ever explains why its ledger works the
            way it does. */}
        <UbStatusBanner tone="info" title={t('ledger.correction.explain')} />

        {!canCorrect && <UbStatusBanner tone="info" title={t('ledger.correction.readOnly')} />}

        <UbField name="direction" label={t('ledger.entry.direction')} labelHidden required>
          {(field) => (
            <UbRadioGroup<LedgerDirection>
              {...field}
              variant="card"
              options={directionOptions}
              ariaLabel={t('ledger.entry.direction')}
            />
          )}
        </UbField>

        <UbField
          name="amount"
          label={t('ledger.entry.amount')}
          placeholder={t('ledger.entry.amount.placeholder')}
          required
        >
          {(field) => <UbMoneyInput {...field} autoFocus inputMode="decimal" />}
        </UbField>

        <UbField
          name="entryDate"
          label={t('ledger.entry.date')}
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

        {isCredit && !isOpening && (
          <UbField
            name="paymentMode"
            label={t('ledger.entry.mode')}
            placeholder={t('ledger.entry.mode.placeholder')}
            required
          >
            {(field) => <UbSelect {...field} options={modeOptions} />}
          </UbField>
        )}

        {isCredit && !isOpening && (
          <UbField
            name="reference"
            label={t('ledger.entry.reference')}
            placeholder={t('ledger.entry.reference.placeholder')}
            hint={t('ledger.entry.reference.hint')}
            optionalLabel={t('common.field.optional')}
          >
            {(field) => <UbTextInput {...field} autoComplete="off" />}
          </UbField>
        )}

        {!isOpening && (
          <UbField
            name="note"
            label={t('ledger.entry.note')}
            placeholder={t('ledger.entry.note.placeholder')}
            hint={t('ledger.entry.note.hint')}
            optionalLabel={t('common.field.optional')}
          >
            {(field) => <UbTextInput {...field} autoComplete="off" />}
          </UbField>
        )}

        {/* Last, and required. The fields above are what the entry should have
            said; this is why it did not — and it is the one thing on this form
            that survives into a record somebody reads a year from now. */}
        <UbField
          name="reason"
          label={t('ledger.correction.reason')}
          placeholder={t('ledger.correction.reason.placeholder')}
          hint={t('ledger.correction.reason.hint')}
          required
        >
          {(field) => <UbTextInput {...field} maxLength={160} autoComplete="off" />}
        </UbField>
      </UbForm>
    </UbDrawer>
  );
}
