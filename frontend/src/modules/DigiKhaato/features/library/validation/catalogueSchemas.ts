import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import { ACCESSION_MAX, ACCESSION_PATTERN, COPIES_MAX } from '../constants/catalogueConstants';
import {
  COPY_SOURCES,
  MATERIAL_TYPES,
  WITHDRAW_REASONS,
  type AddBookFormValues,
  type CopiesFormValues,
  type TitleFormValues,
  type WithdrawFormValues,
} from '../types/catalogue.types';
import { WITHDRAW_NOTE_MIN } from '../view-model/copyDisplay';
import { isIsbnShape, isValidIsbn, normaliseIsbn } from '../view-model/isbn';

/**
 * F03 (LIB-02 §9) — the catalogue forms' rules, composed from the central
 * validators so a price here is the same rule as every money field's. The
 * server re-checks every one of them; these exist so the merchant hears about
 * a wrong check digit or a repeated number before Save, not after.
 */
const TEXT_MAX = 300;
const SHORT_MAX = 40;
const YEAR_MIN = 1500;

export interface CatalogueSchemas {
  readonly titleSchema: Yup.ObjectSchema<TitleFormValues>;
  readonly copiesSchema: Yup.ObjectSchema<CopiesFormValues>;
  readonly addBookSchema: Yup.ObjectSchema<AddBookFormValues>;
  readonly withdrawSchema: Yup.ObjectSchema<WithdrawFormValues>;
}

export const useCatalogueSchemas = (): CatalogueSchemas => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(() => {
    const yearMax = new Date().getFullYear() + 1;
    const titleFields = {
      title: v.requiredBoundedText(TEXT_MAX, 1, 'library.form.title.required'),
      subtitle: v.boundedText(TEXT_MAX),
      authors: v.boundedText(TEXT_MAX),
      isbn: v.boundedText(17).test('isbn', function check(value) {
        if (!value) return true;
        const isbn = normaliseIsbn(value);
        const message =
          isbn.length !== 10 && isbn.length !== 13
            ? 'library.form.isbn.length'
            : !isIsbnShape(isbn)
              ? 'library.form.isbn.format'
              : !isValidIsbn(isbn)
                ? 'library.form.isbn.invalid'
                : null;
        return message ? this.createError({ message: t(message) }) : true;
      }),
      publisher: v.boundedText(160),
      edition: v.boundedText(SHORT_MAX),
      year: v
        .boundedText(4)
        .test(
          'year',
          t('library.form.year.range', { max: yearMax }),
          (value) =>
            !value ||
            (/^\d{4}$/.test(value) && Number(value) >= YEAR_MIN && Number(value) <= yearMax)
        ),
      language: v.boundedText(SHORT_MAX),
      categoryId: v.boundedText(64),
      materialType: Yup.mixed<(typeof MATERIAL_TYPES)[number]>()
        .oneOf([...MATERIAL_TYPES])
        .defined()
        .default('book'),
      callNumber: v.boundedText(SHORT_MAX),
      keywords: v.boundedText(TEXT_MAX),
      notes: v.boundedText(2000),
    };
    const titleSchema = Yup.object(titleFields) as unknown as Yup.ObjectSchema<TitleFormValues>;

    const copiesSchema = Yup.object({
      count: v
        .boundedText(3)
        .test('count', t('library.form.count.range', { max: COPIES_MAX }), (value) => {
          const n = Number(value);
          return /^\d+$/.test(value ?? '') && n >= 1 && n <= COPIES_MAX;
        }),
      numbering: Yup.mixed<'auto' | 'typed'>().oneOf(['auto', 'typed']).defined().default('auto'),
      numbers: Yup.array(Yup.string().defined().default('')).defined().default([]),
      locationId: v.boundedText(64),
      price: v.optionalAmountValidation().defined().default(''),
      acquiredOn: v.boundedText(10),
      source: Yup.mixed<(typeof COPY_SOURCES)[number]>()
        .oneOf([...COPY_SOURCES])
        .defined()
        .default('bought'),
      sourceNote: v.boundedText(160),
      isReference: Yup.boolean().defined().default(false),
      volumeLabel: v.boundedText(24),
    }).test('typed-numbers', '', function check(values) {
      if (values.numbering !== 'typed') return true;
      const count = Number(values.count) || 0;
      const numbers = (values.numbers ?? []).slice(0, count).map((n) => (n ?? '').trim());
      const seen = new Set<string>();
      for (let i = 0; i < count; i += 1) {
        const n = numbers[i] ?? '';
        const path = `numbers.${i}`;
        if (!n) return this.createError({ path, message: t('library.form.number.required') });
        if (n.length > ACCESSION_MAX || !ACCESSION_PATTERN.test(n)) {
          return this.createError({ path, message: t('library.form.number.shape') });
        }
        if (seen.has(n.toUpperCase())) {
          return this.createError({ path, message: t('library.form.number.repeated') });
        }
        seen.add(n.toUpperCase());
      }
      return true;
    }) as unknown as Yup.ObjectSchema<CopiesFormValues>;

    const addBookSchema = Yup.object({
      ...titleFields,
      copies: copiesSchema,
    }) as unknown as Yup.ObjectSchema<AddBookFormValues>;

    const withdrawSchema = Yup.object({
      reason: Yup.mixed<(typeof WITHDRAW_REASONS)[number] | ''>()
        .oneOf([...WITHDRAW_REASONS, ''])
        .defined()
        .default('')
        .test('chosen', t('library.withdraw.reason.required'), (value) => !!value),
      note: v.boundedText(160).when('reason', {
        is: 'other',
        then: (schema) =>
          schema.test(
            'note',
            t('library.withdraw.note.required'),
            (value) => (value ?? '').trim().length >= WITHDRAW_NOTE_MIN
          ),
      }),
    }) as unknown as Yup.ObjectSchema<WithdrawFormValues>;

    return { titleSchema, copiesSchema, addBookSchema, withdrawSchema };
  }, [v, t]);
};
