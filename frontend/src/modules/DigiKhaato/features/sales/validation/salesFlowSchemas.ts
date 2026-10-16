import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';
import { PAYMENT_MODES, type PaymentMode } from 'src/types/domain.types';
import { QUANTITY_TEXT, exceedsQuantity, trimQuantity } from 'src/utils/quantity';

import {
  CREDIT_NOTE_REASONS,
  SETTLEMENTS,
  type CreditNoteReason,
  type Settlement,
} from '../types/salesFlows.types';

/**
 * SAL-04 §10 / SAL-05 §10 — the return form, the apply dialog and the void
 * reason, composed from the central validators so a schema built under `hi`
 * yields Hindi errors. The server re-checks every one of these on rows it has
 * locked (the cap above all); these exist so the merchant hears it before the
 * tap, not instead of the server.
 */

export interface CreditNoteLineForm {
  againstLineId: string;
  qty: string;
}

export interface CreditNoteFormValues {
  documentDate: string;
  reason: CreditNoteReason | '';
  reasonNote: string;
  restock: boolean;
  settlement: Settlement;
  refundMode: PaymentMode;
  refundReference: string;
  lines: CreditNoteLineForm[];
}

export interface ReturnCaps {
  /** The most each invoice line can still take back (`qty − returned_qty`). */
  readonly remaining: Readonly<Record<string, string>>;
  readonly invoiceDate: string;
  /** Lines whose unit is counted, not weighed — the server refuses "1.5 NOS". */
  readonly wholeOnly?: Readonly<Record<string, boolean>>;
}

export interface SalesFlowSchemas {
  readonly applySchemaFor: (max: string) => Yup.ObjectSchema<{ invoiceId: string; amount: string }>;
  readonly creditNoteSchemaFor: (caps: ReturnCaps) => Yup.ObjectSchema<CreditNoteFormValues>;
}

export const useSalesFlowSchemas = (): SalesFlowSchemas => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(() => {
    const applySchemaFor = (max: string) =>
      Yup.object({
        invoiceId: Yup.string().defined().default('').required(t('sales.creditNote.apply.pick')),
        amount: v.amountValidation({ max }).defined().default(''),
      }) as Yup.ObjectSchema<{ invoiceId: string; amount: string }>;

    const creditNoteSchemaFor = (caps: ReturnCaps) =>
      Yup.object({
        documentDate: v.businessDateValidation({ minDate: caps.invoiceDate }).defined().default(''),
        reason: Yup.mixed<CreditNoteReason | ''>()
          .oneOf([...CREDIT_NOTE_REASONS, ''])
          .defined()
          .default('')
          .test('chosen', t('sales.creditNote.reasonRequired'), (value) => !!value),
        reasonNote: v.boundedText(160),
        restock: Yup.boolean().defined().default(true),
        settlement: Yup.mixed<Settlement>()
          .oneOf([...SETTLEMENTS])
          .defined()
          .default('hold_advance'),
        refundMode: Yup.mixed<PaymentMode>()
          .oneOf([...PAYMENT_MODES])
          .defined()
          .default('cash'),
        refundReference: v.boundedText(64),
        lines: Yup.array(
          Yup.object({
            againstLineId: Yup.string().defined().default(''),
            qty: Yup.string()
              .defined()
              .default('')
              .test('number', t('sales.creditNote.qtyFormat'), (value) =>
                value ? QUANTITY_TEXT.test(value) : true
              )
              .test('whole', t('validation.qty.wholeOnly'), function whole(value) {
                const counted = caps.wholeOnly?.[this.parent.againstLineId as string] ?? false;
                return !counted || !value || /^\d+(\.0{1,3})?$/.test(value);
              })
              .test('cap', '', function cap(value) {
                const left = caps.remaining[this.parent.againstLineId as string] ?? '0';
                // Valid digits only (the 'number' test above says why otherwise).
                if (!exceedsQuantity(value, left)) return true;
                return this.createError({
                  message: t('sales.creditNote.overCap', { count: trimQuantity(left) }),
                });
              }),
          })
        )
          .defined()
          .default([])
          .test('one', t('sales.creditNote.linesRequired'), (lines) =>
            (lines ?? []).some((line) => Number(line.qty || '0') > 0)
          ),
      }).test('cheque', '', function cheque(values) {
        if (values.settlement !== 'refund' || values.refundMode !== 'cheque') return true;
        if (values.refundReference.trim()) return true;
        return this.createError({
          path: 'refundReference',
          message: t('sales.creditNote.chequeRequired'),
        });
      }) as Yup.ObjectSchema<CreditNoteFormValues>;

    return { applySchemaFor, creditNoteSchemaFor };
  }, [v, t]);
};
