/**
 * WLB-01 §6 — "8 preset swatches". Every one clears 3:1 against white (a test
 * holds them to it), so tapping a swatch can never produce a colour the server
 * refuses. None is a ledger green or red: those two mean "you will get" and
 * "you will give" everywhere in the product, and a shop painted in either would
 * make every primary button look like a balance.
 */
export const BRAND_SWATCHES: readonly string[] = [
  '#4A47D6', // the product's own indigo
  '#1D4ED8',
  '#0F766E',
  '#7C3AED',
  '#9D174D',
  '#B45309',
  '#334155',
  '#0E7490',
];
