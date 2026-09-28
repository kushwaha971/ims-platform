import { contrastRatio, MIN_PRIMARY_CONTRAST } from 'src/utils/theme';

import { BRAND_SWATCHES } from './brandSwatches';

/** WLB-01 FR-3 — a preset swatch must never be a colour the server refuses. */
describe('brand swatches', () => {
  it.each(BRAND_SWATCHES)('%s clears 3:1 against white', (hex) => {
    expect(contrastRatio(hex, '#FFFFFF')).toBeGreaterThanOrEqual(MIN_PRIMARY_CONTRAST);
  });
});
