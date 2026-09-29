/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MODULE_CODES } from './domain.types';

/**
 * A1 (PLT-X11 T-5) — the client's module list is the server's, string for
 * string and in order.
 *
 * The defect this prevents is the one the list had for its whole life before
 * this test: it carried `loans` and `accounting`, which the server has never
 * had, and lacked `team`, which it has — so a type check passed code that
 * gated a screen on a module no tenant could ever enable, and refused code
 * that asked about one every tenant has. It reads `ModuleCode` out of
 * `apps/common/constants.py` the way the error-code equality test reads the
 * registry, so a code added on either side alone fails here.
 */
const serverModuleCodes = (): string[] => {
  const source = readFileSync(
    join(process.cwd(), '..', 'backend/apps/common/constants.py'),
    'utf8'
  );
  const start = source.indexOf('class ModuleCode(');
  const end = source.indexOf('\nclass ', start + 1);
  expect(start).toBeGreaterThan(-1);
  const block = source.slice(start, end);
  return [...block.matchAll(/^\s+[A-Z_]+ = "([a-z_]+)", _\(/gm)].map((match) => match[1] ?? '');
};

describe('MODULE_CODES', () => {
  it('equals the server ModuleCode values in order', () => {
    const server = serverModuleCodes();
    expect(server.length).toBeGreaterThan(10);
    expect([...MODULE_CODES]).toEqual(server);
  });

  it('carries no code the server does not have', () => {
    expect(MODULE_CODES).not.toContain('loans');
    expect(MODULE_CODES).not.toContain('accounting');
  });
});
