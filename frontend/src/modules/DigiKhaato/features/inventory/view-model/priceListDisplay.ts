import type { TranslateFn } from 'src/hooks/useTranslation';

/** "5% below selling price", "Selling price", "10% above selling price". */
export const priceRule = (adjustPercent: string, t: TranslateFn): string => {
  const value = Number(adjustPercent || 0);
  if (!value) return t('priceLists.rule.same');
  const pct = String(Math.abs(value)).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1');
  return t(value < 0 ? 'priceLists.rule.below' : 'priceLists.rule.above', { pct });
};
