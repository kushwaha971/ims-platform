'use client';

import { useMemo } from 'react';

import dayjs from 'dayjs';
import * as Yup from 'yup';

import {
  EMAIL_MAX_LENGTH,
  MAX_AMOUNT,
  MAX_QTY,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH_PRIVILEGED,
} from 'src/constants';
import { useTranslation } from 'src/hooks/useTranslation';
import { REGEX } from 'src/utils/regexConstants';

/**
 * Part 19 §19.5.2 (ADR-003) — the single source of truth for field-level
 * validation across the application.
 *
 * Every validator is a FACTORY so a caller can chain on it
 * (`v.amountValidation().max(limit, msg)`) without mutating a shared schema.
 * Messages come from `t()`, so a schema built under `hi` produces Hindi errors.
 *
 * A raw `Yup.string().required('Name is required')` anywhere in a feature is a
 * defect (R-F-2): the message is untranslated and the rule is unshared.
 */

/**
 * GSTIN check digit, mod-36 over the 14 preceding characters (statutory
 * algorithm). Implemented locally rather than pulled in as a dependency — it is
 * fifteen lines and R-D-3 says write it (ADR-021).
 */
const GSTIN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const isValidGstinChecksum = (value: string): boolean => {
  if (value.length !== 15) return false;
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const char = value[index];
    if (char === undefined) return false;
    const position = GSTIN_ALPHABET.indexOf(char);
    if (position < 0) return false;
    const factor = index % 2 === 0 ? 1 : 2;
    const product = position * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const checkValue = (36 - (sum % 36)) % 36;
  return GSTIN_ALPHABET[checkValue] === value[14];
};

export interface ValidationSchemas {
  readonly optionalText: (max?: number) => Yup.StringSchema<string | null | undefined>;
  readonly amountValidation: (options?: {
    allowZero?: boolean;
    max?: string;
  }) => Yup.StringSchema<string>;
  readonly quantityValidation: (allowDecimal?: boolean) => Yup.StringSchema<string>;
  readonly percentValidation: (max?: number) => Yup.NumberSchema<number | undefined>;
  readonly mobileValidation: (required?: boolean) => Yup.StringSchema<string | null | undefined>;
  readonly gstinValidation: (required?: boolean) => Yup.StringSchema<string | null | undefined>;
  readonly panValidation: () => Yup.StringSchema<string | null | undefined>;
  readonly hsnValidation: () => Yup.StringSchema<string | null | undefined>;
  readonly pincodeValidation: (required?: boolean) => Yup.StringSchema<string | null | undefined>;
  readonly businessDateValidation: (options?: {
    allowFuture?: boolean;
    minDate?: string;
  }) => Yup.StringSchema<string>;
  readonly nameValidation: (min?: number, max?: number) => Yup.StringSchema<string>;
  readonly noteValidation: (max?: number) => Yup.StringSchema<string | null | undefined>;
  readonly referenceValidation: (max?: number) => Yup.StringSchema<string | null | undefined>;
  readonly uuidValidation: (required?: boolean) => Yup.StringSchema<string | null | undefined>;
  /**
   * CR-2026-09-19-A — email is the MVP identity. Trims, lower-cases and checks
   * the shape, so what leaves the form is what the server stores.
   */
  readonly emailValidation: (required?: boolean) => Yup.StringSchema<string | null | undefined>;
  /** The same rule with a non-null type, for a field that IS the identity. */
  readonly emailIdentityValidation: () => Yup.StringSchema<string>;
  /** PLT-01 §10 — exactly six digits. */
  readonly otpCodeValidation: () => Yup.StringSchema<string>;
  /**
   * PLT-02 §10 — mirrors the server rule, floor included; `confirm` is a
   * client-only check. `minLength` defaults to the privileged floor (10).
   */
  readonly passwordValidation: (options?: { minLength?: number }) => Yup.StringSchema<string>;
  readonly passwordConfirmValidation: (ref: string) => Yup.StringSchema<string>;
  /** PLT-03 §10 — a two-digit GST state code from the closed list. */
  readonly stateCodeValidation: () => Yup.StringSchema<string>;
  readonly enumValidation: <T extends string>(
    values: readonly T[],
    messageId: string
  ) => Yup.MixedSchema<T>;
}

export const useValidationSchemas = (): ValidationSchemas => {
  const { t } = useTranslation();

  return useMemo<ValidationSchemas>(() => {
    // ── Primitives ──────────────────────────────────────────────────────────

    /** Optional string that normalises '' → null so `.notRequired()` behaves. */
    const optionalText = (max = 255) =>
      Yup.string()
        .nullable()
        .transform((value: unknown) =>
          typeof value === 'string' && value.trim() === '' ? null : value
        )
        .max(max, t('validation.maxChars', { value: max }));

    /** Money: a decimal STRING with ≤ 2 dp, > 0 unless allowZero (R-TS-7). */
    const amountValidation = (options?: { allowZero?: boolean; max?: string }) =>
      Yup.string()
        .required(t('validation.amount.required'))
        .matches(REGEX.DECIMAL_2DP, t('validation.amount.format'))
        .test('positive', t('validation.amount.positive'), (value) => {
          if (!value) return false;
          const parsed = Number(value);
          return options?.allowZero ? parsed >= 0 : parsed > 0;
        })
        .test('max', t('validation.amount.tooLarge'), (value) =>
          value ? Number(value) <= Number(options?.max ?? MAX_AMOUNT) : true
        );

    /** Quantity: decimal STRING with ≤ 3 dp; integer-only when the unit says so. */
    const quantityValidation = (allowDecimal = true) =>
      Yup.string()
        .required(t('validation.qty.required'))
        .matches(
          allowDecimal ? REGEX.DECIMAL_3DP : REGEX.INTEGER,
          allowDecimal ? t('validation.qty.format') : t('validation.qty.wholeOnly')
        )
        .test('positive', t('validation.qty.positive'), (value) => Number(value) > 0)
        .test('max', t('validation.qty.tooLarge'), (value) => Number(value) <= Number(MAX_QTY));

    const percentValidation = (max = 100) =>
      Yup.number()
        .typeError(t('validation.percent.format'))
        .min(0, t('validation.percent.min'))
        .max(max, t('validation.percent.max', { value: max }));

    /** Indian mobile: E.164 with +91 default; exactly 10 digits after the code. */
    const mobileValidation = (required = true) => {
      const base = Yup.string()
        .transform((value: unknown) =>
          typeof value === 'string' ? value.replace(/\s|-/g, '') : value
        )
        .matches(REGEX.MOBILE_E164_IN, t('validation.mobile.format'));
      return required
        ? base.required(t('validation.mobile.required'))
        : base.nullable().notRequired();
    };

    /** GSTIN: 15 chars, statutory layout, checksum verified. */
    const gstinValidation = (required = false) => {
      const base = Yup.string()
        .transform((value: unknown) =>
          typeof value === 'string' ? value.trim().toUpperCase() : value
        )
        .length(15, t('validation.gstin.length'))
        .matches(REGEX.GSTIN, t('validation.gstin.format'))
        .test(
          'checksum',
          t('validation.gstin.checksum'),
          (value) => !value || isValidGstinChecksum(value)
        );
      return required
        ? base.required(t('validation.gstin.required'))
        : base.nullable().notRequired();
    };

    const panValidation = () =>
      Yup.string()
        .nullable()
        .notRequired()
        .transform((value: unknown) =>
          typeof value === 'string' ? value.trim().toUpperCase() : value
        )
        .matches(REGEX.PAN, t('validation.pan.format'));

    const hsnValidation = () =>
      Yup.string().nullable().notRequired().matches(REGEX.HSN, t('validation.hsn.format'));

    const pincodeValidation = (required = false) => {
      const base = Yup.string().matches(REGEX.PINCODE_IN, t('validation.pincode.format'));
      return required
        ? base.required(t('validation.pincode.required'))
        : base.nullable().notRequired();
    };

    /** Business date: ISO yyyy-mm-dd, not in the future unless allowFuture. */
    const businessDateValidation = (options?: { allowFuture?: boolean; minDate?: string }) =>
      Yup.string()
        .required(t('validation.date.required'))
        .test(
          'valid',
          t('validation.date.invalid'),
          (value) => !!value && dayjs(value, 'YYYY-MM-DD', true).isValid()
        )
        .test('notFuture', t('validation.date.future'), (value) =>
          options?.allowFuture ? true : !!value && !dayjs(value).isAfter(dayjs(), 'day')
        )
        .test(
          'min',
          t('validation.date.tooOld'),
          (value) =>
            !options?.minDate || (!!value && !dayjs(value).isBefore(dayjs(options.minDate), 'day'))
        );

    const nameValidation = (min = 2, max = 120) =>
      Yup.string()
        .trim()
        .required(t('validation.name.required'))
        .min(min, t('validation.name.tooShort', { value: min }))
        .max(max, t('validation.name.tooLong', { value: max }));

    const noteValidation = (max = 255) => optionalText(max);
    const referenceValidation = (max = 64) => optionalText(max);

    const uuidValidation = (required = true) => {
      const base = Yup.string().matches(REGEX.UUID, t('validation.id.format'));
      return required ? base.required(t('validation.id.required')) : base.nullable().notRequired();
    };

    /**
     * The transform runs BEFORE the checks, so " Ramesh@Example.COM " is
     * validated — and submitted — as `ramesh@example.com`. A server that
     * lower-cases on write and a client that does not is how one person ends up
     * unable to log in with the address they typed at sign-up.
     */
    const emailBase = () =>
      Yup.string()
        .transform((value: unknown) =>
          typeof value === 'string' ? value.trim().toLowerCase() : value
        )
        .max(EMAIL_MAX_LENGTH, t('validation.maxChars', { value: EMAIL_MAX_LENGTH }))
        .matches(REGEX.EMAIL, t('validation.email.format'));

    const emailValidation = (required = false) => {
      const base = emailBase();
      return required
        ? base.required(t('validation.email.required'))
        : base.nullable().notRequired();
    };

    const emailIdentityValidation = () => emailBase().required(t('validation.email.required'));

    /**
     * PLT-01 §10 — the code is a STRING: "012345" is not 12345.
     *
     * CR-2026-09-19-A backlogged the OTP flow; this validator is retained with
     * `UbOtpInput` and has no screen at MVP.
     */
    const otpCodeValidation = () =>
      Yup.string()
        .required(t('validation.otp.required'))
        .matches(REGEX.OTP_CODE, t('validation.otp.format'));

    /**
     * PLT-02 FR-2 / §10. The common-password list is Django's and lives on the
     * server: the client cannot carry 20 000 words into a 120 kB auth bundle, so
     * that rule arrives as a 400 with `details.password` and is anchored by
     * `applyServerErrors()`. Everything the client CAN check, it checks here.
     */
    const passwordValidation = (options?: { minLength?: number }) => {
      const min = options?.minLength ?? PASSWORD_MIN_LENGTH_PRIVILEGED;
      return Yup.string()
        .required(t('validation.password.required'))
        .min(min, t('validation.password.tooShort', { value: min }))
        .max(PASSWORD_MAX_LENGTH, t('validation.maxChars', { value: PASSWORD_MAX_LENGTH }))
        .matches(REGEX.PASSWORD, t('validation.password.format'));
    };

    const passwordConfirmValidation = (ref: string) =>
      Yup.string()
        .required(t('validation.password.confirmRequired'))
        .oneOf([Yup.ref(ref)], t('validation.password.mismatch'));

    const stateCodeValidation = () =>
      Yup.string()
        .required(t('validation.stateCode.required'))
        .matches(REGEX.GST_STATE_CODE, t('validation.stateCode.format'));

    const enumValidation = <T extends string>(values: readonly T[], messageId: string) =>
      Yup.mixed<T>()
        .oneOf([...values], t(messageId))
        .required(t(messageId));

    return {
      optionalText,
      amountValidation,
      quantityValidation,
      percentValidation,
      mobileValidation,
      gstinValidation,
      panValidation,
      hsnValidation,
      pincodeValidation,
      businessDateValidation,
      nameValidation,
      noteValidation,
      referenceValidation,
      uuidValidation,
      emailValidation,
      emailIdentityValidation,
      otpCodeValidation,
      passwordValidation,
      passwordConfirmValidation,
      stateCodeValidation,
      enumValidation,
    };
  }, [t]);
};

/**
 * Runs a schema and returns its own message, or undefined when valid. Used
 * where a boolean `isValidSync` is not enough — e.g. disabling a button while
 * still telling the user why. Keeps one source of truth for the copy.
 */
export const getYupErrorMessage = (schema: Yup.AnySchema, value: unknown): string | undefined => {
  try {
    schema.validateSync(value);
    return undefined;
  } catch (error) {
    if (error instanceof Yup.ValidationError) return error.message;
    throw error;
  }
};
