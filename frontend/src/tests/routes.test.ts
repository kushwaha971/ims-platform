/**
 * @jest-environment node
 *
 * Part 19 §19.6 — `src/routes.ts` is the only place an application path is
 * written down, and this is what keeps it that way.
 *
 * Before it existed, `'/dashboard'` appeared thirteen times across four
 * features, `'/onboarding/step/' + n` was built in four places from three
 * different expressions, and `proxy.ts` kept its own copy of the guarded
 * prefixes — which is how a section ends up in the menu and not in the guard.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  APP_ROUTE_PREFIXES,
  ONBOARDING_STEP_MAX,
  RETIRED_ROUTES,
  ROUTES,
  loginPathWithNext,
  onboardingStepPath,
} from 'src/routes';

const ROOT = process.cwd();

const walk = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });

describe('ROUTES', () => {
  it('holds every address exactly once', () => {
    const paths = Object.values(ROUTES);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every address a leading slash and no trailing one', () => {
    for (const path of Object.values(ROUTES)) {
      expect(path.startsWith('/')).toBe(true);
      expect(path.endsWith('/')).toBe(false);
    }
  });

  it('guards every application section the menu can reach', () => {
    const guarded = (href: string): boolean =>
      APP_ROUTE_PREFIXES.some((prefix) => href === prefix || href.startsWith(`${prefix}/`));

    for (const href of [
      ROUTES.DASHBOARD,
      ROUTES.PARTIES,
      ROUTES.LEDGER_REMINDERS,
      ROUTES.ITEMS,
      ROUTES.SALES_INVOICES,
      ROUTES.PURCHASE_BILLS,
      ROUTES.PAYMENTS,
      ROUTES.EXPENSES,
      ROUTES.REPORTS,
      ROUTES.SETTINGS,
      ROUTES.SETTINGS_PLAN,
      ROUTES.SETTINGS_TEAM,
      ROUTES.SWITCH_TENANT,
    ]) {
      expect(guarded(href)).toBe(true);
    }
  });

  it('never guards an (auth) address, or the login page would redirect to itself', () => {
    const guarded = (href: string): boolean =>
      APP_ROUTE_PREFIXES.some((prefix) => href === prefix || href.startsWith(`${prefix}/`));

    for (const href of [
      ROUTES.LOGIN,
      ROUTES.SIGNUP,
      ROUTES.FORGOT_PASSWORD,
      ROUTES.RESET_PASSWORD,
      ROUTES.SET_PASSWORD,
      ROUTES.ONBOARDING,
    ]) {
      expect(guarded(href)).toBe(false);
    }
  });

  it('sends the retired /otp address somewhere real (CR-2026-09-19-A)', () => {
    expect(RETIRED_ROUTES['/otp']).toBe(ROUTES.LOGIN);
  });
});

describe('onboardingStepPath', () => {
  it('builds the wizard address for each of the four steps', () => {
    expect(onboardingStepPath(1)).toBe('/onboarding/step/1');
    expect(onboardingStepPath(4)).toBe('/onboarding/step/4');
  });

  it('clamps, because the step number comes back from the server', () => {
    expect(onboardingStepPath(0)).toBe('/onboarding/step/1');
    expect(onboardingStepPath(-3)).toBe('/onboarding/step/1');
    expect(onboardingStepPath(9)).toBe(`/onboarding/step/${ONBOARDING_STEP_MAX}`);
    expect(onboardingStepPath(2.7)).toBe('/onboarding/step/2');
  });
});

describe('loginPathWithNext', () => {
  it('encodes the destination once, in one place', () => {
    expect(loginPathWithNext('/parties/7f3a?tab=all')).toBe(
      '/login?next=%2Fparties%2F7f3a%3Ftab%3Dall'
    );
  });
});

describe('no application path is hard-coded outside src/routes.ts', () => {
  /**
   * `src/api/APIPaths.ts` is a different namespace entirely — those are server
   * endpoints, not addresses in this application, and they are already
   * centralised in their own module.
   */
  const EXEMPT = ['src/routes.ts', 'src/api/APIPaths.ts'];

  it('leaves no literal "/dashboard", "/login", "/switch" or "/onboarding/step/…"', () => {
    const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))].filter(
      (file) => !/\.test\.tsx?$/.test(file) && !EXEMPT.some((exempt) => file.endsWith(exempt))
    );

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const [index, line] of source.split('\n').entries()) {
        // Only executable lines; a path quoted inside a comment is prose.
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        if (/['"`]\/(dashboard|login|signup|switch|set-password|forgot-password)\b/.test(code)) {
          offenders.push(`${file.slice(ROOT.length + 1)}:${index + 1} ${line.trim()}`);
        }
        if (/onboarding\/step\//.test(code)) {
          offenders.push(`${file.slice(ROOT.length + 1)}:${index + 1} ${line.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
