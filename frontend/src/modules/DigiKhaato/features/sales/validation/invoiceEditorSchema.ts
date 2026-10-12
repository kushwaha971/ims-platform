import { useMemo } from 'react';

import dayjs from 'dayjs';
import * as Yup from 'yup';

import { MAX_AMOUNT } from 'src/constants';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';
import { buildValidationSchemas } from 'src/hooks/useValidationSchemas';
import { isValidMobile, readsAsIndian } from 'src/utils/phone';
import { REGEX } from 'src/utils/regexConstants';

import {
  previewInput,
  type InvoiceFormValues,
  type InvoiceLineForm,
  type RateLookup,
} from '../view-model/invoiceForm';
import { computeDocumentTotals, type EngineGstType } from '../view-model/taxEngine';

/**
 * SAL-02 §10 — the invoice and estimate editor's checks, before the tap.
 *
 * Until 6 Oct 2026 the editor had no schema at all: every rule was the
 * server's, and a refusal came back as one snackbar ("Please check the
 * highlighted fields") over a form with nothing highlighted. Worse, a row the
 * merchant had half filled — an item with quantity 0, a rate of "12.34567" —
 * failed `isCompleteLine` and was silently LEFT OUT of the bill, so it issued
 * without a line the merchant could see on the screen. Every row that names
 * an item or a description is now checked, and one that cannot be sent stops
 * the issue with the reason under the cell.
 *
 * The rules mirror `apps/sales/services/lines.py` and `payload.py` message for
 * message; the server stays the authority (it re-checks all of them, plus the
 * ones only it can see — an archived item, a retired tax code).
 */

export const RATE_4DP = /^\d+(\.\d{1,4})?$/;
const DECIMAL_2DP = /^\d+(\.\d{1,2})?$/;
const NOTES_MAX = 2000;
const DESCRIPTION_MAX = 255;
const WALK_IN_NAME_MAX = 120;

/** A row is part of the bill once it names an item or a description. */
export const isStartedLine = (line: Pick<InvoiceLineForm, 'itemId' | 'description'>): boolean =>
  !!line.itemId || line.description.trim() !== '';

/**
 * The server's rule: any country's mobile in E.164 (India's ten digits by
 * default). A bare ten-digit Indian number is still read, because a draft
 * saved before the field became `UbPhoneInput` holds one.
 */
export const isWalkInMobile = (value: string): boolean =>
  isValidMobile(value) || /^[6-9]\d{9}$/.test(value.replace(/[\s-]/g, ''));

export interface InvoiceSchemaOptions {
  readonly kind: 'invoice' | 'estimate' | 'sales_order' | 'delivery_challan';
  /** The business's zone — it decides what "today" is for the bill date (EC-8). */
  readonly timeZone?: string | null;
}

/**
 * What the schema needs from the shop to price the bill: the bill-discount
 * check compares a ₹ discount with the subtotal, which depends on the rates by
 * date. Passed as RHF's `context`, which React Hook Form refreshes on every
 * render, so the check always prices with the rates on screen.
 */
export interface InvoiceSchemaContext {
  readonly rates: Readonly<Record<string, RateLookup>>;
  readonly gstType: EngineGstType;
  readonly tenantState: string;
}

const subtotalOf = (values: InvoiceFormValues, context: InvoiceSchemaContext | undefined): number =>
  Number(
    computeDocumentTotals(
      previewInput(
        { ...values, discountType: '', discountValue: '' },
        context?.rates ?? {},
        context?.gstType ?? 'regular',
        context?.tenantState ?? ''
      )
    ).subtotal
  );

/**
 * The schema for a given `t`. The editor never imports this module statically:
 * `invoiceEditorResolver` loads it (and Yup with it) on the first validation,
 * so the route chunk the counter opens does not carry ~18 KB of Yup.
 */
export const buildInvoiceEditorSchema = (
  t: TranslateFn,
  options: InvoiceSchemaOptions
): Yup.ObjectSchema<InvoiceFormValues> => {
  const v = buildValidationSchemas(t, options.timeZone ?? null);
  const { kind } = options;
  const onOrAfterDate = (messageId: string) =>
    Yup.string()
      .defined()
      .default('')
      .test('afterDate', t(messageId), function after(value) {
        const date = this.parent.documentDate as string;
        if (!value || !date) return true;
        return !dayjs(value).isBefore(dayjs(date), 'day');
      });

  const line = Yup.object({
    itemId: Yup.string().nullable().defined().default(null),
    description: Yup.string()
      .defined()
      .default('')
      .max(DESCRIPTION_MAX, t('validation.maxChars', { value: DESCRIPTION_MAX })),
    hsnSac: Yup.string()
      .defined()
      .default('')
      .test('hsn', t('validation.hsn.format'), (value) => !value || REGEX.HSN.test(value.trim())),
    qty: Yup.string()
      .defined()
      .default('')
      .test('qty', '', function qty(value) {
        if (!isStartedLine(this.parent as InvoiceLineForm)) return true;
        const allowDecimal = Boolean(this.parent.allowDecimal);
        const error = (id: string) => this.createError({ message: t(id) });
        const text = (value ?? '').trim();
        if (!text) return error('validation.qty.required');
        if (!(allowDecimal ? REGEX.DECIMAL_3DP : REGEX.INTEGER).test(text)) {
          return error(allowDecimal ? 'validation.qty.format' : 'validation.qty.wholeOnly');
        }
        if (Number(text) <= 0) return error('validation.qty.positive');
        return true;
      }),
    unitCode: Yup.string().defined().default(''),
    allowDecimal: Yup.boolean().defined().default(false),
    unitPrice: Yup.string()
      .defined()
      .default('')
      .test('rate', '', function rate(value) {
        const text = (value ?? '').trim();
        if (!text || !isStartedLine(this.parent as InvoiceLineForm)) return true;
        if (!RATE_4DP.test(text)) {
          return this.createError({ message: t('sales.validation.rateFormat') });
        }
        if (Number(text) > Number(MAX_AMOUNT)) {
          return this.createError({ message: t('validation.amount.tooLarge') });
        }
        return true;
      }),
    taxInclusive: Yup.boolean().defined().default(false),
    discountType: Yup.mixed<InvoiceLineForm['discountType']>()
      .oneOf(['', 'percent', 'amount'])
      .defined()
      .default(''),
    discountValue: Yup.string()
      .defined()
      .default('')
      .test('discount', '', function discount(value) {
        const row = this.parent as InvoiceLineForm;
        const text = (value ?? '').trim();
        if (!row.discountType || !text || !isStartedLine(row)) return true;
        if (!DECIMAL_2DP.test(text)) {
          return this.createError({ message: t('validation.amount.format') });
        }
        if (row.discountType === 'percent' && Number(text) > 100) {
          return this.createError({ message: t('validation.percent.max', { value: 100 }) });
        }
        const gross = Number(row.qty || 0) * Number(row.unitPrice || 0);
        if (row.discountType === 'amount' && Number(text) > gross) {
          return this.createError({ message: t('sales.validation.discountOverLine') });
        }
        return true;
      }),
    taxCode: Yup.string().defined().default(''),
  });

  return Yup.object({
    mode: Yup.mixed<InvoiceFormValues['mode']>().oneOf(['walkIn', 'party']).defined(),
    partyId: Yup.string()
      .nullable()
      .defined()
      .default(null)
      .test('party', t('sales.validation.partyRequired'), function party(value) {
        return this.parent.mode !== 'party' || !!value;
      }),
    partyName: Yup.string().defined().default(''),
    partyStateCode: Yup.string().nullable().defined().default(null),
    walkInName: Yup.string()
      .defined()
      .default('')
      .max(WALK_IN_NAME_MAX, t('validation.maxChars', { value: WALK_IN_NAME_MAX })),
    walkInMobile: Yup.string()
      .defined()
      .default('')
      .test('mobile', function mobile(value) {
        if (this.parent.mode !== 'walkIn' || !value?.trim() || isWalkInMobile(value)) return true;
        return this.createError({
          message: readsAsIndian(value)
            ? t('validation.mobile.format')
            : t('validation.mobile.formatOther'),
        });
      }),
    documentDate: v.businessDateValidation().defined().default(''),
    dueOn: onOrAfterDate('sales.validation.dueBeforeDate'),
    validUntil:
      kind === 'estimate'
        ? onOrAfterDate('sales.validation.validUntilBeforeDate')
        : Yup.string().defined().default(''),
    challanType: Yup.mixed<InvoiceFormValues['challanType']>().defined().default('other'),
    transporter: Yup.string()
      .defined()
      .default('')
      .max(60, t('validation.maxChars', { value: 60 })),
    vehicleNumber: Yup.string()
      .defined()
      .default('')
      .max(60, t('validation.maxChars', { value: 60 })),
    ewayBillNumber: Yup.string()
      .defined()
      .default('')
      .max(60, t('validation.maxChars', { value: 60 })),
    placeOfSupplyState: Yup.string()
      .defined()
      .default('')
      .test('pos', t('sales.validation.posRequired'), (value) => /^\d{2}$/.test(value ?? '')),
    reverseCharge: Yup.boolean().defined().default(false),
    roundOffEnabled: Yup.boolean().defined().default(true),
    discountType: Yup.mixed<InvoiceFormValues['discountType']>()
      .oneOf(['', 'percent', 'amount'])
      .defined()
      .default(''),
    discountValue: Yup.string()
      .defined()
      .default('')
      .test('discount', '', function discount(value) {
        const type = this.parent.discountType as InvoiceFormValues['discountType'];
        const text = (value ?? '').trim();
        if (!type || !text) return true;
        if (!DECIMAL_2DP.test(text)) {
          return this.createError({ message: t('validation.amount.format') });
        }
        if (type === 'percent' && Number(text) > 100) {
          return this.createError({ message: t('validation.percent.max', { value: 100 }) });
        }
        const context = this.options.context as InvoiceSchemaContext | undefined;
        if (type === 'amount' && Number(text) > subtotalOf(this.parent, context)) {
          return this.createError({ message: t('sales.validation.discountOverSubtotal') });
        }
        return true;
      }),
    notes: v.boundedText(NOTES_MAX),
    terms: v.boundedText(NOTES_MAX),
    lines: Yup.array(line)
      .defined()
      .default([])
      .test('one', t('sales.validation.linesRequired'), (lines) =>
        (lines ?? []).some((row) => isStartedLine(row as InvoiceLineForm))
      ),
  }) as unknown as Yup.ObjectSchema<InvoiceFormValues>;
};

/** The same schema through a hook — for tests and any screen that already ships Yup. */
export const useInvoiceEditorSchema = (
  options: InvoiceSchemaOptions
): Yup.ObjectSchema<InvoiceFormValues> => {
  const { t } = useTranslation();
  const { kind } = options;
  return useMemo(() => buildInvoiceEditorSchema(t, { kind }), [t, kind]);
};
