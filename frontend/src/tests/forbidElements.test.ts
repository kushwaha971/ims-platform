/**
 * @jest-environment node
 *
 * Part 23 §23.3 — the rule that makes this discipline hold.
 *
 * BrandHub's Customer module contains no raw `<div>`, `<p>` or `<h1>` because
 * its authors do not write them; nothing in `apps/frontend/eslint.config.mjs`
 * stops one appearing. That is a convention, and a convention survives exactly
 * as long as the people who hold it.
 *
 * Here it is a build failure. This suite asks ESLint itself what it would do
 * with a feature file and with a design-system file, rather than reading the
 * config as text — a config that parses is not the same as a config that
 * applies, and the interesting failure is the one where a later `files` glob
 * quietly takes the rule off `src/modules/**`.
 *
 * It shells out because `eslint.config.mjs` is ESM and jest's CJS runtime
 * cannot dynamically import it; `--print-config` is ESLint's own answer to
 * "what would you do with this file", which is exactly the question.
 *
 * The two "does it actually fire" cases write a real file and delete it again,
 * rather than piping through `--stdin`: the parser is type-aware, and a path
 * that is not in the TypeScript project fails to parse — which would make both
 * probes pass for the wrong reason, the design-system one loudest of all.
 */
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ESLINT_BIN = join(ROOT, 'node_modules/.bin/eslint');

/** A file under the ban, files exempt from it, and the document itself. */
const FEATURE_FILE = 'src/modules/UdhaarBook/features/parties/components/PartyListRow.tsx';
const SHELL_FILE = 'src/components/layout/UbAppShell.tsx';
const ROUTE_FILE = 'app/not-found.tsx';
const DESIGN_SYSTEM_FILE = 'src/design-system/UbText/UbText.tsx';
const PRIMITIVE_FILE = 'src/design-system/primitives/mlLayoutPrimitives.tsx';
const DOCUMENT_FILE = 'app/layout.tsx';

interface ForbiddenEntry {
  readonly element: string;
  readonly message?: string;
}

type ForbidRule = readonly [severity: unknown, options?: { forbid?: readonly ForbiddenEntry[] }];

const run = (args: readonly string[]): string =>
  execFileSync(ESLINT_BIN, [...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

const forbidRuleFor = (file: string): ForbidRule => {
  const printed = JSON.parse(run(['--print-config', file])) as {
    rules?: Record<string, unknown>;
  };
  return (printed.rules?.['react/forbid-elements'] ?? []) as ForbidRule;
};

interface LintMessage {
  readonly ruleId: string | null;
  readonly severity: number;
  readonly message: string;
  readonly fatal?: boolean;
}

const PROBE_SOURCE = "export const Probe = (): React.JSX.Element => <div>probe</div>;\n";

const lintProbe = (relativePath: string): readonly LintMessage[] => {
  const absolute = join(ROOT, relativePath);
  writeFileSync(absolute, PROBE_SOURCE, 'utf8');
  try {
    let raw: string;
    try {
      raw = run([relativePath, '--format', 'json']);
    } catch (error) {
      // A non-zero exit is the EXPECTED outcome when the rule fires; the JSON
      // report is still on stdout.
      raw = String((error as { stdout?: Buffer | string }).stdout ?? '[]');
    }
    const results = JSON.parse(raw) as readonly { readonly messages?: readonly LintMessage[] }[];
    const messages = results[0]?.messages ?? [];
    // A parse failure would make every assertion below meaningless.
    expect(messages.filter((message) => message.fatal)).toEqual([]);
    return messages.filter((message) => message.ruleId === 'react/forbid-elements');
  } finally {
    rmSync(absolute, { force: true });
  }
};

// Six ESLint processes; the flat config is resolved from disk each time.
jest.setTimeout(120_000);

describe('react/forbid-elements is configured, not merely mentioned', () => {
  it('is an ERROR on feature components — `--max-warnings=0` means a warning would do, but an error says so', () => {
    const [severity] = forbidRuleFor(FEATURE_FILE);
    expect(severity).toBe(2);
  });

  it('covers feature code, shared layout components and route files alike', () => {
    for (const file of [FEATURE_FILE, SHELL_FILE, ROUTE_FILE]) {
      const [severity] = forbidRuleFor(file);
      expect(severity).toBe(2);
    }
  });

  it('bans every host element a screen would otherwise reach for', () => {
    const [, options] = forbidRuleFor(FEATURE_FILE);
    const banned = (options?.forbid ?? []).map((entry) => entry.element);

    for (const element of [
      'div',
      'span',
      'p',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'dl',
      'dt',
      'dd',
      'section',
      'article',
      'header',
      'footer',
      'main',
      'nav',
      'aside',
      'form',
      'label',
      'input',
      'select',
      'textarea',
      'button',
      'a',
      'img',
      'table',
      'tr',
      'td',
      'th',
      'hr',
    ]) {
      expect(banned).toContain(element);
    }
  });

  it('names the replacement for each element, so the error is an instruction', () => {
    const [, options] = forbidRuleFor(FEATURE_FILE);
    const entries = options?.forbid ?? [];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(typeof entry.message).toBe('string');
      expect(entry.message?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('EXEMPTS the design system — it is where these elements legitimately live', () => {
    for (const file of [DESIGN_SYSTEM_FILE, PRIMITIVE_FILE]) {
      const [severity] = forbidRuleFor(file);
      expect(severity).toBeUndefined();
    }
  });

  it('EXEMPTS app/layout.tsx, which renders the document itself', () => {
    const [severity] = forbidRuleFor(DOCUMENT_FILE);
    expect(severity === 0 || severity === undefined).toBe(true);
  });
});

describe('the rule actually fires', () => {
  it('rejects a raw <div> written into a feature path', () => {
    const messages = lintProbe(
      'src/modules/UdhaarBook/features/parties/components/ForbidElementsProbe.tsx'
    );
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]?.severity).toBe(2);
    expect(messages[0]?.message).toContain('UbBox');
  });

  it('allows the same markup inside the design system', () => {
    const messages = lintProbe('src/design-system/UbText/ForbidElementsProbe.tsx');
    expect(messages).toHaveLength(0);
  });
});
