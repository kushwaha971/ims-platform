/**
 * @jest-environment node
 *
 * WP-03 REUSE-02 / REUSE-04 — rules that have ONE owner stay with it.
 *
 * Each case below was found by the readiness reuse audit
 * (docs/shop-ims-readiness/10-reuse-inventory.md) as a rule written out again
 * in feature code instead of being called from where it lives. A copy agrees
 * with its owner on the day it is pasted and then drifts: the sales copy of the
 * WhatsApp link guessed an Indian number out of the last ten digits of ANY
 * number, which the shared builder refuses to do because a balance sent to a
 * half-parsed number cannot be taken back.
 *
 * The scan reads source text rather than an import graph because the defect is
 * the re-typed rule, not a missing import. Tests and the owners themselves are
 * excluded.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { CREDIT_OVERRIDE_ROLES, selectMayOverrideCreditLimit } from 'src/redux/slice/sessionSlice';
import type { RootState } from 'src/redux/store';
import { REASON_MAX_CHARS, REASON_MIN_CHARS } from 'src/utils/reason';

const SRC = join(process.cwd(), 'src');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return [];
    return [path];
  });

const FILES = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}));

const offenders = (pattern: RegExp, owner: string): string[] =>
  FILES.filter((file) => file.path !== owner && pattern.test(file.text)).map((file) => file.path);

describe('one owner per shared rule', () => {
  it('builds every wa.me link in src/utils/share.ts', () => {
    expect(offenders(/https:\/\/wa\.me\/\$\{/, 'utils/share.ts')).toEqual([]);
  });

  it('never opens WhatsApp or SMS with text the merchant could not edit (MSG-02)', () => {
    // Outgoing text goes through `UbShareSheet`, the editable composer. A
    // `window.open` after a request is also a pop-up phones block.
    expect(offenders(/window\.open\(\s*build(WhatsApp|Sms)Url/, '')).toEqual([]);
  });

  it('decides who may go over a credit limit in the session slice', () => {
    const typedOut = /role\s*===\s*'owner'\s*\|\|\s*role\s*===\s*'admin'/;
    expect(offenders(typedOut, 'redux/slice/sessionSlice.ts')).toEqual([]);
  });

  it("adds a lending stop's arrears to today's instalment in lendingDisplay only", () => {
    const asked = /Number\([\w.]+\.dueToday\)\s*\+\s*Number\([\w.]+\.arrears\)/;
    expect(
      offenders(asked, 'modules/DigiKhaato/features/lending/view-model/lendingDisplay.ts')
    ).toEqual([]);
  });
});

describe('money is added in utils/money.ts, not in floats (WP-03 D-01)', () => {
  // `ledgerEntrySlice` is the recorded exception (X-06): it lives on the app
  // shell, where decimal.js would cost every route, and it re-rounds at once.
  const EXCEPTIONS = new Set(['modules/DigiKhaato/features/ledger/redux/ledgerEntrySlice.ts']);
  // Money fields by name: quantities, counts and sort keys are a different
  // concern (`utils/quantity.ts`) and are recorded separately (D-05).
  const MONEY =
    '(?:amount|dues|due|total|fee|interest|deduction|deposit|owed|arrears|balance|paid)';
  const floatMoney = [
    new RegExp(`Number\\([^()]*${MONEY}[^()]*\\)\\s*[+-]\\s*Number\\(`, 'i'),
    new RegExp(
      `\\.reduce\\(\\(\\w+,\\s*\\w+\\)\\s*=>\\s*\\w+\\s*\\+\\s*Number\\(\\w+\\.${MONEY}`,
      'i'
    ),
    new RegExp(`Math\\.max\\(Number\\([^()]*${MONEY}`, 'i'),
  ];

  it('sums money with addMoney / sumMoney / subtractMoney', () => {
    const found = FILES.filter(
      (file) => !EXCEPTIONS.has(file.path) && floatMoney.some((pattern) => pattern.test(file.text))
    ).map((file) => file.path);
    expect(found).toEqual([]);
  });
});

describe('calendar days are counted in utils/calendarDays.ts (WP-03 D-02)', () => {
  it('keeps the one-day constant there', () => {
    expect(offenders(/86_?400_?000/, 'utils/calendarDays.ts')).toEqual([]);
  });
});

describe('quantities are worked out in utils/quantity.ts, not in floats (WP-03 D-05)', () => {
  it('never subtracts or compares Number(qty) values', () => {
    // `Number('0.3') - Number('0.1')` is 0.19999999999999998: a return cap
    // worked out that way refused the last 0.2 KG and printed the noise.
    const floatQty = [
      // A sign test (`Number(qty) > 0`) is exact and stays allowed.
      /Number\([\w.?]*(qty|Qty|available|requested)[^)]*\)\s*([-+<]|>(?!\s*0\b))/,
      // `(?<!=)` so an arrow function's `=>` is not read as a comparison.
      /(?<!=)[-+<>]\s*Number\([\w.?]*(qty|Qty|available|requested)[^)]*\)/,
    ];
    const found = FILES.filter(
      (file) =>
        file.path !== 'utils/quantity.ts' && floatQty.some((pattern) => pattern.test(file.text))
    ).map((file) => file.path);
    expect(found).toEqual([]);
  });
});

describe('a reason is three to 160 characters, decided in utils/reason.ts (WP-03 D-04b)', () => {
  it('is never typed out as a literal or a local constant', () => {
    // Ten dialogs and eleven schemas each wrote "at least 3, at most 160"
    // themselves; one changing its minimum would disagree with the server.
    const typedOut = [
      /trim\(\)\.length\s*(<|>=)\s*3\b/,
      /\b[A-Z_]*REASON_MIN\s*=\s*3\b/,
      /\bREASON_MAX\s*=\s*160\b/,
      /requiredBoundedText\(\s*(160|REASON_MAX)\s*,\s*3\b/,
    ];
    const found = FILES.filter(
      (file) =>
        file.path !== 'utils/reason.ts' && typedOut.some((pattern) => pattern.test(file.text))
    ).map((file) => file.path);
    expect(found).toEqual([]);
  });
});

describe('a ⋯ sheet of actions is UbMoreActions / UbActionSheet (WP-03 D-04a)', () => {
  it('is not built again from a ⋯ button and a dialog in feature code', () => {
    // Five menus each paired a MoreHorizontal button with a dialog of ghost
    // buttons and wrote "close before acting" themselves; the design-system
    // sheet closed in the other order. A sixth copy would choose again.
    const dialogs = /<(UbDialog|CompactDialog|LibraryDialog)\b/;
    const found = FILES.filter(
      (file) =>
        !file.path.startsWith('design-system/') &&
        /\bMoreHorizontal\b/.test(file.text) &&
        dialogs.test(file.text)
    ).map((file) => file.path);
    expect(found).toEqual([]);
  });
});

describe('a bordered list of rows is UbPanel as="ul" (WP-03 D-04d)', () => {
  it('is not hand-built from divide-y and a card border in feature code', () => {
    // The three "which bills does this money go to" lists each wrote the same
    // bordered, divided ul and the same row; a fourth would drift in padding
    // and in how a long bill number wraps.
    const handBuilt = /divide-y\b[^"]*\brounded-card\b[^"]*\bborder\b/;
    const found = FILES.filter(
      (file) => !file.path.startsWith('design-system/') && handBuilt.test(file.text)
    ).map((file) => file.path);
    expect(found).toEqual([]);
  });
});

describe('client previews of server rules match the server', () => {
  it('names the same override roles as apps/parties/services/credit.py', () => {
    const python = readFileSync(
      join(process.cwd(), '..', 'backend', 'apps', 'parties', 'services', 'credit.py'),
      'utf8'
    );
    const declared = /OVERRIDE_ROLES[^=]*=\s*\(([^)]*)\)/.exec(python)?.[1] ?? '';
    const roles = [...declared.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
    expect(roles.length).toBeGreaterThan(0);
    expect([...CREDIT_OVERRIDE_ROLES]).toEqual(roles);
  });

  it('asks for a reason of the length apps/sales/constants.py accepts', () => {
    const python = readFileSync(
      join(process.cwd(), '..', 'backend', 'apps', 'sales', 'constants.py'),
      'utf8'
    );
    const read = (name: string) =>
      Number(new RegExp(`^${name}\\s*=\\s*(\\d+)`, 'm').exec(python)?.[1]);
    expect([REASON_MIN_CHARS, REASON_MAX_CHARS]).toEqual([
      read('VOID_REASON_MIN'),
      read('VOID_REASON_MAX'),
    ]);
  });
});

describe('selectMayOverrideCreditLimit', () => {
  const as = (role: string | null) =>
    ({ session: { activeTenant: role ? { role } : null } }) as unknown as RootState;

  it('lets the owner and an admin go over, and nobody else', () => {
    expect(selectMayOverrideCreditLimit(as('owner'))).toBe(true);
    expect(selectMayOverrideCreditLimit(as('admin'))).toBe(true);
    expect(selectMayOverrideCreditLimit(as('staff'))).toBe(false);
    expect(selectMayOverrideCreditLimit(as('lending_agent'))).toBe(false);
    expect(selectMayOverrideCreditLimit(as(null))).toBe(false);
  });
});
