'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useFormContext, useWatch } from 'react-hook-form';

import { UbField, UbGrid, UbMoneyInput, UbQuantityInput, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { isBelowCost, priceAfterEdit, type Gst } from '../view-model/itemPricing';

import type { ItemFormValues } from '../types/item.types';

/**
 * WP-07 — the item's selling price, and for a member who may see costs, its
 * purchase price and margin beside it, kept in step by `priceAfterEdit`
 * (docs/shop-ims-readiness/14-item-pricing-design-review.md).
 *
 * A member without `reports.financial.read` sees the selling price alone: the
 * cost is withheld from them everywhere else on an item, and the server now
 * refuses one from them, so a box they could type into would only be refused.
 * Margin is a form value that is never sent; it is read from the two prices.
 */
export function ItemPriceFields({
  canSeeCost,
  gst,
}: Readonly<{ canSeeCost: boolean; gst: Gst }>): React.JSX.Element {
  const { t } = useTranslation();
  const { control, getValues, setValue } = useFormContext<ItemFormValues>();
  const cost = useWatch({ control, name: 'purchasePrice' }) ?? '';
  const margin = useWatch({ control, name: 'margin' });
  const hasCost = Number(cost) > 0;
  /* The margin as it stood when the merchant went into the cost box. A cost is
     typed a keystroke at a time; reading "is a margin held?" afresh on each one
     would let the margin derived from "4" (on the way to "45") take hold and
     price the item at ₹562.50. */
  const heldMargin = useRef<string | null>(null);

  const follow = useCallback(
    (edited: Parameters<typeof priceAfterEdit>[0]) => {
      if (!canSeeCost) return;
      const next = priceAfterEdit(
        edited,
        {
          sellingPrice: getValues('sellingPrice') ?? '',
          cost: getValues('purchasePrice') ?? '',
          margin:
            edited === 'cost' ? (heldMargin.current ?? getValues('margin')) : getValues('margin'),
        },
        gst
      );
      if (next.sellingPrice !== (getValues('sellingPrice') ?? '')) {
        setValue('sellingPrice', next.sellingPrice, { shouldDirty: true, shouldValidate: true });
      }
      if (next.margin !== getValues('margin')) {
        setValue('margin', next.margin, { shouldDirty: true, shouldValidate: true });
      }
    },
    [canSeeCost, getValues, setValue, gst]
  );

  // A different GST rate, or switching "price includes GST", keeps the price
  // and rereads the margin — the price is what the merchant charges.
  const { inclusive, rate, cess } = gst;
  useEffect(() => {
    follow('gst');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the GST's own parts, not the object
  }, [inclusive, rate, cess]);

  const marginHint = !hasCost
    ? t('items.form.margin.needsCost')
    : isBelowCost(margin || null)
      ? undefined
      : t('items.form.margin.hint');

  return (
    <>
      <UbField
        name="sellingPrice"
        label={t('items.form.sellingPrice.label')}
        placeholder={t('items.form.price.placeholder')}
      >
        {(field) => (
          <UbMoneyInput
            {...field}
            onChange={(next) => {
              field.onChange(next);
              follow('price');
            }}
          />
        )}
      </UbField>

      {canSeeCost && (
        <UbGrid columns={{ base: 1, sm: 2 }} gap={3}>
          <UbField
            name="purchasePrice"
            label={t('items.form.purchasePrice.label')}
            placeholder={t('items.form.price.placeholder')}
            hint={t('items.form.purchasePrice.hint')}
          >
            {(field) => (
              <UbMoneyInput
                {...field}
                onFocus={() => {
                  heldMargin.current = getValues('margin');
                }}
                onChange={(next) => {
                  field.onChange(next);
                  follow('cost');
                }}
                onBlur={() => {
                  heldMargin.current = null;
                  field.onBlur();
                }}
              />
            )}
          </UbField>
          <UbField
            name="margin"
            label={t('items.form.margin.label')}
            placeholder={t('items.form.margin.placeholder')}
            hint={marginHint}
          >
            {(field) => (
              <>
                <UbQuantityInput
                  {...field}
                  value={field.value as string}
                  decimals={1}
                  signed
                  unit="%"
                  disabled={!hasCost}
                  onChange={(next) => {
                    field.onChange(next);
                    follow('margin');
                  }}
                  onBlur={() => {
                    follow('marginDone');
                    field.onBlur();
                  }}
                />
                {hasCost && isBelowCost(margin || null) && (
                  <UbText variant="caption" tone="warning">
                    {t('items.form.margin.belowCost')}
                  </UbText>
                )}
              </>
            )}
          </UbField>
        </UbGrid>
      )}
    </>
  );
}
