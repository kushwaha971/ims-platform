'use client';

import { useMemo } from 'react';

import dayjs from 'dayjs';
import * as Yup from 'yup';

import { MAX_AMOUNT, MAX_QTY } from 'src/constants';
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
  readonly emailValidation: (required?: boolean) => Yup.StringSchema<string | null | undefined>;
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

    const emailValidation = (required = false) => {
      const base = Yup.string().trim().email(t('validation.email.format')).max(254);
      return required
        ? base.required(t('validation.email.required'))
        : base.nullable().notRequired();
    };

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
