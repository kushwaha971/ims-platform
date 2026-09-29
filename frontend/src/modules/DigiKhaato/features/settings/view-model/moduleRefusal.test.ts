import type { ApiErrorShape } from 'src/types/api.types';

import { moduleRefusalFrom } from './moduleRefusal';

const refusal = (details: unknown, code = 'module_has_data'): ApiErrorShape =>
  ({ code, message: 'This feature still has records that need attention.', details }) as never;

/**
 * A12 (PLT-X10 §2, R14) — the 409 that refuses switching a module off now
 * carries a `breakdown` of what is still open. These pin how it is read, so a
 * refusal that the server made specific is never shown to the merchant as the
 * vague "still has records" line again.
 */
describe('moduleRefusalFrom', () => {
  it('reads the module and every breakdown row from a module_has_data refusal', () => {
    const read = moduleRefusalFrom(
      refusal({
        module: 'library',
        count: 5,
        breakdown: [
          { label_id: 'library.off.copiesOut', count: 3 },
          { label_id: 'payments.off.depositsHeld', count: 2 },
        ],
      })
    );
    expect(read).toEqual({
      module: 'library',
      lines: [
        { labelId: 'library.off.copiesOut', count: 3 },
        { labelId: 'payments.off.depositsHeld', count: 2 },
      ],
    });
  });

  it('keeps an unlabelled row, because the lines must add up to the count', () => {
    const read = moduleRefusalFrom(
      refusal({ module: 'inventory', count: 4, breakdown: [{ label_id: null, count: 4 }] })
    );
    expect(read?.lines).toEqual([{ labelId: null, count: 4 }]);
  });

  it('is null for any other error and for a refusal from a server without the breakdown', () => {
    expect(moduleRefusalFrom(refusal({ module: 'sales' }, 'validation_error'))).toBeNull();
    expect(moduleRefusalFrom(refusal({ module: 'sales', count: 2 }))).toBeNull();
    expect(moduleRefusalFrom(undefined)).toBeNull();
  });

  it('drops malformed rows instead of drawing "NaN" or a raw object', () => {
    const read = moduleRefusalFrom(
      refusal({
        module: 'gym',
        count: 1,
        breakdown: [{ label_id: 'gym.off.active', count: 1 }, { count: 'x' }, 'junk'],
      })
    );
    expect(read?.lines).toEqual([{ labelId: 'gym.off.active', count: 1 }]);
  });
});
