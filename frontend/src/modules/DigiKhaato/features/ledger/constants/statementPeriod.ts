import type { StatementPreset } from '../types/statement.types';

/**
 * The period presets, in a module that imports NOTHING.
 *
 * This exists for one measured reason. `statementSlice` needs the default
 * preset for its initial state, and `store.ts` registers every slice
 * statically — so importing it from `view-model/statementDisplay.ts`, where it
 * naturally lives, pulled that whole module onto the app shell: the financial
 * year arithmetic, the month-length table, the URL parser and the range check,
 * downloaded by every merchant who opens the login screen to render a login
 * screen. Measured at 2.2 KB gz on `shared app`, which the bundle gate refused.
 *
 * It is the same finding PTY-01 recorded about its field-name constants — "they
 * live in a module that imports nothing, because importing them from the file
 * that also holds the Yup schema dragged Yup into the route" — and the rule
 * `bundle-budgets.json` states in one line: **anything a slice imports is on
 * every route.** Module-level imports tree-shake between modules, not within
 * one.
 */
export const STATEMENT_PRESETS: readonly StatementPreset[] = [
  'thisMonth',
  'lastMonth',
  'thisFy',
  'lastFy',
  'allTime',
  'custom',
];

/**
 * §8 — "This FY" is what a merchant means by "the year".
 *
 * India's financial year starts on 1 April. Not a preference and not
 * configurable: it is the statutory year every Indian business files against,
 * and a date library's default would hand them January.
 */
export const DEFAULT_PRESET: StatementPreset = 'thisFy';
export const FY_START_MONTH = 4;
