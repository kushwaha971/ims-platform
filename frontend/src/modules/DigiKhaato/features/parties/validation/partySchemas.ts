'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import type { PartyFormValues } from '../types/party.types';

/**
 * Part 19 §19.5.3 — the party form's schema, COMPOSED from the central
 * validators rather than written here. A raw `Yup.string().required()` in this
 * file would be a defect (R-F-2): untranslated, and a second opinion about a
 * rule that already has one.
 *
 * ── What this schema does NOT check ─────────────────────────────────────────
 * The GSTIN check digit is here, because it is arithmetic and the answer is the
 * same on both sides. The GSTIN-versus-state comparison is NOT: the server
 * saves that case and returns a warning, so a client-side rule refusing it
 * would make the form stricter than the product and a merchant would be unable
 * to record a supplier who really is registered in another state.
 *
 * Duplicate mobile is not here either, for the obvious reason: only the server
 * knows what else is in the book.
 */

export const usePartySchemas = (): {
  readonly partySchema: Yup.ObjectSchema<PartyFormValues>;
} => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(
    () => ({
      partySchema: Yup.object({
        name: v.requiredText(160, 'parties.form.name.required').defined(),
        mobile: v.mobileValidation(false).defined().default(''),
        altPhone: v.mobileValidation(false).defined().default(''),
        email: v.emailValidation(false).defined().default(''),
        displayCode: Yup.string().max(24).defined().default(''),
        gstin: v.gstinValidation(false).defined().default(''),
        stateCode: Yup.string().defined().default(''),
        billingLine1: Yup.string().max(120).defined().default(''),
        billingCity: Yup.string().max(60).defined().default(''),
        billingPincode: v.pincodeValidation(false).defined().default(''),
        notes: Yup.string().max(500, t('parties.form.notes.max')).defined().default(''),
        creditLimit: v.optionalAmountValidation().defined().default(''),
        creditDays: Yup.string()
          .defined()
          .default('')
          .test(
            'credit-days-range',
            t('parties.form.creditDays.range'),
            (value) => !value || (Number(value) >= 0 && Number(value) <= 365)
          ),
        collectionDate: Yup.string().defined().default(''),
        smsOptIn: Yup.boolean().defined().default(true),
        consentSource: Yup.string().defined().default(''),
        openingAmount: v.optionalAmountValidation().defined().default(''),
        openingDirection: Yup.mixed<'debit' | 'credit'>()
          .oneOf(['debit', 'credit'])
          .defined()
          .default('debit'),
        openingAsOf: Yup.string().defined().default(''),

        // FR-4 — a party this business neither buys from nor sells to is a
        // contact, and this product does not have contacts. Checked here as
        // well as on the server because the server's answer is a 400 after a
        // round trip, and this one is instant and points at the control.
        isCustomer: Yup.boolean().defined().default(true),
        isSupplier: Yup.boolean().defined().default(false),
      }).test(
        'one-of-customer-or-supplier',
        t('parties.form.type.required'),
        function check(values) {
          if (values.isCustomer || values.isSupplier) return true;
          return this.createError({ path: 'isCustomer', message: t('parties.form.type.required') });
        }
      ),
    }),
    [v, t]
  );
};
