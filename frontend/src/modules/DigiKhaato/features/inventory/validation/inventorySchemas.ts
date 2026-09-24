'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import type { AdjustmentFormValues, ItemFormValues, Unit } from '../types/item.types';

export interface CategoryFormValues {
  name: string;
  parentId: string;
}

export interface UnitFormValues {
  code: string;
  name: string;
  allowDecimal: boolean;
}

/**
 * INV-01 §10 and INV-06 §10, client side. The SERVER is the authority and says
 * everything again; these exist so the merchant hears about a bad field at the
 * field, before a round trip (§10: "client and server enforce identical rules").
 * Imported only by the two drawers, which are `dynamic()` — Yup never reaches
 * a list route's chunk.
 */

const HSN_GOODS = /^\d{4}(\d{2}(\d{2})?)?$/;
const HSN_SERVICE = /^99\d{2}(\d{2})?$/;
const SKU = /^[A-Za-z0-9._/-]+$/;
const BARCODE = /^[A-Za-z0-9-]+$/;
const QTY = (decimals: boolean) => (decimals ? /^\d+(\.\d{1,3})?$/ : /^\d+$/);
const COST = /^\d+(\.\d{1,4})?$/;

export interface InventorySchemas {
  readonly itemSchema: Yup.ObjectSchema<ItemFormValues>;
  readonly adjustmentSchema: Yup.ObjectSchema<AdjustmentFormValues>;
  readonly categorySchema: Yup.ObjectSchema<CategoryFormValues>;
  readonly unitSchema: Yup.ObjectSchema<UnitFormValues>;
}

export const useInventorySchemas = (units: readonly Unit[]): InventorySchemas => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(() => {
    const allowsDecimal = (unitId: string): boolean =>
      units.find((unit) => unit.id === unitId)?.allowDecimal ?? true;

    const itemSchema: Yup.ObjectSchema<ItemFormValues> = Yup.object({
      name: v.requiredText(160, 'items.form.name.required').defined(),
      itemType: Yup.mixed<'goods' | 'service'>().oneOf(['goods', 'service']).defined(),
      categoryId: Yup.string().defined().default(''),
      unitId: Yup.string().required(t('items.form.unit.required')).defined(),
      sku: Yup.string()
        .defined()
        .default('')
        .max(48, t('validation.maxChars', { value: 48 }))
        .test('sku', t('items.form.sku.format'), (value) => !value || SKU.test(value)),
      barcode: Yup.string()
        .defined()
        .default('')
        .test(
          'barcode',
          t('items.form.barcode.format'),
          (value) => !value || (value.length >= 4 && value.length <= 48 && BARCODE.test(value))
        ),
      hsnSac: Yup.string()
        .defined()
        .default('')
        .test('hsn', function check(value) {
          if (!value) return true;
          const service = this.parent.itemType === 'service';
          if (service ? HSN_SERVICE.test(value) : HSN_GOODS.test(value)) return true;
          return this.createError({
            message: t(service ? 'items.form.sac.format' : 'items.form.hsn.format'),
          });
        }),
      taxCode: Yup.string().required(t('items.form.tax.required')).defined(),
      taxInclusiveSelling: Yup.boolean().defined(),
      sellingPrice: v.optionalAmountValidation().defined().default(''),
      purchasePrice: v.optionalAmountValidation().defined().default(''),
      mrp: v
        .optionalAmountValidation()
        .defined()
        .default('')
        .test('mrp-vs-selling', t('items.form.mrp.belowSelling'), function check(value) {
          const selling = Number(this.parent.sellingPrice || 0);
          return !value || !this.parent.taxInclusiveSelling || selling <= Number(value);
        }),
      trackStock: Yup.boolean().defined(),
      reorderPoint: Yup.string()
        .defined()
        .default('')
        .test('reorder', function check(value) {
          if (!value || !this.parent.trackStock) return true;
          const decimals = allowsDecimal(this.parent.unitId);
          return QTY(decimals).test(value)
            ? true
            : this.createError({
                message: t(decimals ? 'validation.qty.format' : 'validation.qty.wholeOnly'),
              });
        }),
      description: Yup.string()
        .defined()
        .default('')
        .max(2000, t('validation.maxChars', { value: 2000 })),
      openingQty: Yup.string()
        .defined()
        .default('')
        .test('opening-qty', function check(value) {
          if (!value) return true;
          const decimals = allowsDecimal(this.parent.unitId);
          if (!QTY(decimals).test(value)) {
            return this.createError({
              message: t(decimals ? 'validation.qty.format' : 'validation.qty.wholeOnly'),
            });
          }
          return Number(value) > 0 || this.createError({ message: t('validation.qty.positive') });
        }),
      openingCost: Yup.string()
        .defined()
        .default('')
        .test(
          'opening-cost',
          t('items.form.opening.cost.format'),
          (value) => !value || COST.test(value)
        ),
      openingAsOf: Yup.string().defined().default(''),
    });

    const adjustmentSchema: Yup.ObjectSchema<AdjustmentFormValues> = Yup.object({
      adjustmentDate: Yup.string().required(t('validation.date.required')).defined(),
      reason: Yup.mixed<AdjustmentFormValues['reason']>()
        .oneOf(
          ['damage', 'theft', 'count', 'personal_use', 'other'],
          t('stock.adjust.reason.required')
        )
        .defined(),
      note: Yup.string()
        .defined()
        .max(255, t('validation.maxChars', { value: 255 }))
        .test('note-other', t('stock.adjust.note.required'), function check(value) {
          return this.parent.reason !== 'other' || (value ?? '').trim().length >= 3;
        }),
      lines: Yup.array()
        .of(
          Yup.object({
            /* A wholly blank line (the editor always offers one to type into)
               is ignored rather than refused; it is dropped before posting. */
            itemId: Yup.string()
              .defined()
              .test('item', t('stock.adjust.line.item.required'), function check(value) {
                return Boolean(value) || !(this.parent.qty ?? '').trim();
              }),
            itemName: Yup.string().defined(),
            unitCode: Yup.string().defined(),
            allowDecimal: Yup.boolean().defined(),
            onHand: Yup.string().defined(),
            avgCost: Yup.string().defined(),
            mode: Yup.mixed<'by' | 'to'>().oneOf(['by', 'to']).defined(),
            qty: Yup.string()
              .defined()
              .test('qty', function check(value) {
                const text = (value ?? '').trim();
                if (!this.parent.itemId) return true;
                if (!text)
                  return this.createError({ message: t('stock.adjust.line.qty.required') });
                const signed = this.parent.mode === 'by';
                const body = signed && text.startsWith('-') ? text.slice(1) : text;
                if (!QTY(this.parent.allowDecimal).test(body)) {
                  return this.createError({
                    message: t(
                      this.parent.allowDecimal
                        ? 'validation.qty.format'
                        : 'validation.qty.wholeOnly'
                    ),
                  });
                }
                const delta =
                  this.parent.mode === 'to'
                    ? Number(text) - Number(this.parent.onHand || 0)
                    : Number(text);
                return (
                  delta !== 0 || this.createError({ message: t('stock.adjust.line.qty.noChange') })
                );
              }),
            unitCost: Yup.string()
              .defined()
              .test('cost', function check(value) {
                const text = (this.parent.qty ?? '').trim();
                if (!this.parent.itemId) return true;
                const delta =
                  this.parent.mode === 'to'
                    ? Number(text) - Number(this.parent.onHand || 0)
                    : Number(text);
                if (!(delta > 0)) return true;
                if (!value)
                  return this.createError({ message: t('stock.adjust.line.cost.required') });
                return (
                  COST.test(value) ||
                  this.createError({ message: t('items.form.opening.cost.format') })
                );
              }),
          })
        )
        .test('some-line', t('stock.adjust.lines.required'), (lines) =>
          (lines ?? []).some((line) => Boolean(line.itemId))
        )
        .max(100, t('stock.adjust.lines.max'))
        .defined(),
    });

    const categorySchema: Yup.ObjectSchema<CategoryFormValues> = Yup.object({
      name: v.requiredText(60, 'inventory.masters.category.name.required').defined(),
      parentId: Yup.string().defined().default(''),
    });

    const unitSchema: Yup.ObjectSchema<UnitFormValues> = Yup.object({
      code: Yup.string()
        .required(t('inventory.masters.unit.code.required'))
        .matches(/^[A-Za-z0-9]{1,8}$/, t('inventory.masters.unit.code.format'))
        .defined(),
      name: v.requiredText(40, 'inventory.masters.unit.name.required').defined(),
      allowDecimal: Yup.boolean().defined(),
    });

    return { itemSchema, adjustmentSchema, categorySchema, unitSchema };
  }, [v, t, units]);
};
