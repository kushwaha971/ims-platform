/**
 * UAT D7 — the items list printed the raw code ("GST5") in its GST column.
 * A `GSTn` code reads as its rate ("5%"); the zero-rate categories keep their
 * translated names (`taxRateLabel`'s set); anything else is shown as-is.
 */
export const taxCodeLabel = (code: string, t: (id: string) => string): string => {
  const rate = /^GST(\d+(?:\.\d+)?)$/.exec(code.trim());
  if (rate) return `${Number(rate[1])}%`;
  if (['EXEMPT', 'NIL', 'NONGST'].includes(code)) return t(`tax.rate.${code}`);
  return code;
};
