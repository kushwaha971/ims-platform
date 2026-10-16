import { hasReason } from './reason';

describe('hasReason (WP-03 D-04b)', () => {
  it('needs three characters, spaces not counted', () => {
    expect(hasReason('abc')).toBe(true);
    expect(hasReason('  ab  ')).toBe(false);
    expect(hasReason('   ')).toBe(false);
    expect(hasReason(undefined)).toBe(false);
    expect(hasReason('गलत')).toBe(true);
  });
});
