import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';
import { PAYMENT_MODES } from 'src/types/domain.types';

import type { OpeningBalanceValues } from '../hooks/useOpeningBalance';
import type { LedgerCorrectionFormValues, LedgerEntryFormValues } from '../types/ledger.types';

/**
 * LED-01 §10 — the entry form's rules, composed from the central validators.
 *
 * A raw `Yup.string().required('…')` in a feature is a defect (R-F-2): the
 * shared factories carry the translated messages, so a schema built under `hi`
 * yields Hindi errors, and the amount and date rules are the same ones every
 * other money form in the product uses.
 *
 * ── What is deliberately NOT validated here ──────────────────────────────
 * Whether the party is archived, and whether the amount crosses their credit
 * limit. Both are facts about a record this form is not holding and that can
 * change between the drawer opening and Save — another device can archive the
 * party or post an entry — so a client that pre-judged either would be
 * refusing on stale data. The server decides both, and the drawer renders what
 * it says. §19.9.2's rule: mirror the arithmetic, leave the cross-record
 * questions to the server.
 */
export interface LedgerSchemas {
  readonly ledgerEntrySchema: Yup.ObjectSchema<LedgerEntryFormValues>;
  /**
   * LED-02 §10. Three fields, and every one of them is a rule an ordinary entry
   * already obeys — which is why they are the same central validators rather
   * than a second set: the server runs ONE validator for both writes, and a
   * client that checked different rules would refuse what the server accepts or
   * the reverse.
   */
  readonly openingBalanceSchema: Yup.ObjectSchema<OpeningBalanceValues>;
  /**
   * LED-03 §10. The entry's own rules plus a required reason.
   *
   * Built from the same field shapes as `ledgerEntrySchema` rather than written
   * out again — see `entryFields` below.
   */
  readonly ledgerCorrectionSchema: Yup.ObjectSchema<LedgerCorrectionFormValues>;
  /**
   * The reverse dialog's single field.
   *
   * It IS `ledgerCorrectionSchema`'s `reason`, pulled out so the dialog does not
   * carry five controls' rules to validate one box — and so the two can never
   * disagree about how short a reason may be, which would mean a merchant being
   * refused in one dialog for what the other accepted.
   */
  readonly reverseReasonSchema: Yup.ObjectSchema<{ reason: string }>;
}

export const useLedgerSchemas = (): LedgerSchemas => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  /* ONE set of field rules, used by both forms.
 
     `ledgerCorrectionSchema` is `ledgerEntrySchema` plus a reason, and it is
     built that way rather than written out again so a correction can never
     accept an amount an entry would refuse. That is the client-side form of the
     lesson LED-02's opening balance taught on the server, where a second copy of
     the validation let an opening through with three decimal places and a date
     in the year 202600 while an ordinary entry refused both. */
  const entryFields = useMemo(
    () => ({
      direction: Yup.mixed<'debit' | 'credit'>()
        .oneOf(['debit', 'credit'])
        .defined()
        .default('debit'),
      // Required and `> 0` by default, which is exactly what this field
      // wants: the amount carries no sign, because direction is a control.
      // `UbMoneyInput` cannot even type a minus.
      amount: v.amountValidation().defined().default(''),
      // Never in the future — a khata records what happened, not what is
      // going to. The tenant's timezone decides what "today" is, not the
      // device's (EC-8); `businessDateValidation` reads it.
      entryDate: v.businessDateValidation().defined().default(''),
      note: v.boundedText(255),
      // `paymentMode` is required only for a credit, and the cross-field test
      // is at the object level rather than a `.when()` on the field, because
      // `this.createError({ path })` is what anchors the message on the
      // control the merchant can see. A `.when()` produces the same refusal
      // with the error on a field that is hidden for a debit.
      paymentMode: Yup.mixed<(typeof PAYMENT_MODES)[number] | ''>()
        .oneOf([...PAYMENT_MODES, ''])
        .defined()
        .default(''),
      reference: v.boundedText(64),
    }),
    [v]
  );

  /* Three characters is a low bar on purpose — "dup" is a real reason a
     shopkeeper gives, and a form that demanded a sentence would get one full
     stop. What it stops is somebody clicking through the dialog with an empty
     box, which would leave the surviving row saying what changed and nothing
     saying why. */
  const reasonField = useMemo(
    () => v.requiredBoundedText(160, 3, 'ledger.correction.reason.required'),
    [v]
  );

  /** The cross-field rule both forms carry, defined once for the same reason. */
  const creditNeedsAMode = useMemo(
    () =>
      function check(this: Yup.TestContext, values: { direction: string; paymentMode: string }) {
        if (values.direction !== 'credit' || values.paymentMode) return true;
        return this.createError({
          path: 'paymentMode',
          message: t('ledger.entry.mode.required'),
        });
      },
    [t]
  );

  return useMemo(
    () => ({
      ledgerEntrySchema: Yup.object(entryFields).test(
        'credit-needs-a-mode',
        t('ledger.entry.mode.required'),
        creditNeedsAMode
      ) as Yup.ObjectSchema<LedgerEntryFormValues>,

      ledgerCorrectionSchema: Yup.object({
        ...entryFields,
        reason: reasonField,
      }).test(
        'credit-needs-a-mode',
        t('ledger.entry.mode.required'),
        creditNeedsAMode
      ) as Yup.ObjectSchema<LedgerCorrectionFormValues>,

      reverseReasonSchema: Yup.object({
        reason: reasonField,
      }) as Yup.ObjectSchema<{ reason: string }>,

      openingBalanceSchema: Yup.object({
        // `> 0` by default, which is EC-3: a ₹0.00 opening is "no opening", and
        // a merchant who meant that should leave the section alone rather than
        // have a meaningless first row written into their khata.
        amount: v.amountValidation().defined().default(''),
        direction: Yup.mixed<'debit' | 'credit'>()
          .oneOf(['debit', 'credit'])
          .defined()
          .default('debit'),
        // §5 lets the date go back to 2000-01-01, which `businessDateValidation`
        // already enforces as its floor — a date before that is a mistyped year,
        // and an opening dated 0026 sorts above every real row for ever.
        asOf: v.businessDateValidation().defined().default(''),
      }) as Yup.ObjectSchema<OpeningBalanceValues>,
    }),
    [v, t, entryFields, creditNeedsAMode, reasonField]
  );
};
