'use client';

import { useCallback, useEffect, useId } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbAmount,
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { useLedgerSchemas } from '../validation/ledgerSchemas';
import { entryAmountView } from '../view-model/entryDisplay';
import { khataEntryTitle } from '../view-model/narration';

import type { UseEntryCorrectionResult } from '../hooks/useEntryCorrection';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/ledger';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/validation';

/**
 * LED-03 FR-2 — "Reverse this entry", and the one question it asks.
 *
 * ── Why this is a dialog and the correction is a drawer ────────────────────
 * They ask for different amounts of work. A reversal is a decision with one
 * input: the merchant has already looked at the row and knows it should not
 * exist, and all that remains is to say why. A correction is a form with six
 * fields. Putting both in a drawer would make the common one feel heavier than
 * it is; putting both in a dialog would cramp the other.
 *
 * ── Why the entry is shown again inside the dialog ─────────────────────────
 * §23's confirmation rule, and it earns its space here. The ⋯ menu that opened
 * this covered the row it belongs to, and on a phone the list has very likely
 * scrolled. A merchant confirming "reverse ₹500 to Ramesh — cement bags" is
 * confirming something; one confirming "reverse this entry" is confirming that
 * they pressed a button.
 *
 * ── Why the reason is not optional ────────────────────────────────────────
 * The reason is the feature. The mistake stays in the book for ever, and the
 * row beside it says what was done; without a reason nothing says why, and
 * "why" is the question somebody arrives with a year later. Three characters
 * is the floor — "dup" is a real answer a shopkeeper gives.
 */
export function ReverseEntryDialog({
  correction,
}: Readonly<{ correction: UseEntryCorrectionResult }>): React.JSX.Element | null {
  const { t, d } = useTranslation();
  const { reverseReasonSchema } = useLedgerSchemas();
  const formId = useId();
  const { reversing, isSaving, formErrors, close, submitReverse } = correction;

  /* React Hook Form for ONE field, and not for symmetry's sake: `UbField` reads
     its error out of RHF context by name, which is what puts the message under
     the control and `aria-describedby` on it. A hand-rolled `useState` pair
     here would be a second way of doing the thing §19.5.4 exists to do once —
     and the rule it checks is the correction schema's own `reason`, so the two
     dialogs cannot disagree about how short a reason may be. */
  const form = useForm<{ reason: string }>({
    resolver: yupResolver(reverseReasonSchema),
    mode: 'onTouched',
    defaultValues: { reason: '' },
  });
  const { reset } = form;

  /* Reset when a DIFFERENT entry is put in front of the merchant, not on close:
     a reversal that failed on a bad connection reopens with what they typed,
     for the same reason the entry drawer keeps its draft. */
  useEffect(() => {
    reset({ reason: '' });
  }, [reversing?.id, reset]);

  const handleSubmit = useCallback(
    async (values: { reason: string }) => {
      await submitReverse(values.reason);
    },
    [submitReverse]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) close();
    },
    [close]
  );

  if (!reversing) return null;

  const view = entryAmountView(reversing.direction, reversing.entryType, reversing.bucket);

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      title={t('ledger.correction.reverse.title')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={close} disabled={isSaving}>
            {t('common.action.cancel')}
          </UbButton>
          {/* `variant="danger"` because this is destructive in the sense that
              matters to a merchant: it changes a number somebody has been told.
              Nothing is deleted — the row stays — but the balance moves, and a
              control that moves a balance should not look like Save. */}
          <UbButton
            type="submit"
            form={formId}
            variant="destructive"
            busy={isSaving}
            busyLabel={t('ledger.correction.reversing')}
          >
            {t('ledger.correction.reverse.confirm')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={formErrors}>
        {/* The row, restated. See the component docstring. */}
        <UbStack direction="row" justify="between" align="start" className="gap-3">
          <UbStack gap={1} className="min-w-0 flex-1">
            <UbText variant="body" className="truncate">
              {khataEntryTitle(reversing, t)}
            </UbText>
            <UbText variant="caption" tone="tertiary">
              {d(reversing.entryDate)}
            </UbText>
          </UbStack>
          <UbAmount
            value={reversing.amount}
            tone={view.tone}
            sign="none"
            label={t(view.labelId)}
            size="sm"
          />
        </UbStack>

        <UbText variant="caption" tone="tertiary">
          {t('ledger.correction.reverse.body')}
        </UbText>

        <UbField
          name="reason"
          label={t('ledger.correction.reason')}
          placeholder={t('ledger.correction.reason.placeholder')}
          hint={t('ledger.correction.reason.hint')}
          required
        >
          {(field) => <UbTextInput {...field} maxLength={160} autoComplete="off" autoFocus />}
        </UbField>
      </UbForm>
    </UbDialog>
  );
}
