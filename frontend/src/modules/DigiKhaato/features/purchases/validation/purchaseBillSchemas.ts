import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import { SUPPLIER_INVOICE_MAX } from '../constants/purchaseConstants';

/**
 * PUR-01 §10 / PUR-04 §10 — the bill's client-side rules, composed from the
 * central validators so a schema built under `hi` yields Hindi errors.
 *
 * `purchaseBillSchema` covers the HEADER only and runs at Record, not on every
 * keystroke: a draft is saved half-entered (FR-8), so the editor's autosave
 * never meets it. The lines and every figure are the server's to judge — it
 * recomputes at record regardless (§0.11 rule 3) and its 400 lands on the
 * cell through `applyServerErrors`.
 */
export interface PurchaseBillHeader {
  readonly partyId: string | null;
  readonly supplierInvoiceNumber: string;
  readonly notes: string;
}

export interface PurchaseBillSchemas {
  readonly purchaseBillSchema: Yup.ObjectSchema<PurchaseBillHeader>;
  readonly voidReasonSchema: Yup.ObjectSchema<{ reason: string }>;
}

export const usePurchaseBillSchemas = (): PurchaseBillSchemas => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(() => {
    const purchaseBillSchema = Yup.object({
      partyId: Yup.string()
        .nullable()
        .defined()
        .default(null)
        .required(t('purchases.editor.supplierRequired')),
      supplierInvoiceNumber: v.boundedText(SUPPLIER_INVOICE_MAX),
      notes: v.boundedText(2000),
    }) as Yup.ObjectSchema<PurchaseBillHeader>;

    const voidReasonSchema = Yup.object({
      reason: v.requiredBoundedText(160, 3, 'purchases.void.reasonRequired'),
    }) as Yup.ObjectSchema<{ reason: string }>;

    return { purchaseBillSchema, voidReasonSchema };
  }, [v, t]);
};
