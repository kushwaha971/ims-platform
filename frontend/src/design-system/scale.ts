/**
 * Part 23 §23.2 — the scales the layout and typography components share, in one
 * file so `UbStack`, `UbGrid`, `UbSpacer` and `UbText` cannot drift apart.
 *
 * Every value below is a LITERAL Tailwind class rather than a template string.
 * Tailwind's scanner reads source text, so `gap-${n}` produces no CSS at all;
 * a static map is not defensiveness, it is the only thing that works.
 *
 * The numeric keys are the Tailwind spacing scale, which `tailwind.config.js`
 * binds to `--space-*` for the integers (§23.2.5). The half steps (0.5, 1.5,
 * 2.5) are Tailwind's own defaults and are kept because the existing screens
 * use them for the 2 px and 6 px gaps inside a row.
 */

export type UbSpace = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 4 | 5 | 6 | 8 | 10;

export const UB_GAP: Readonly<Record<UbSpace, string>> = {
  0: 'gap-0',
  0.5: 'gap-0.5',
  1: 'gap-1',
  1.5: 'gap-1.5',
  2: 'gap-2',
  2.5: 'gap-2.5',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
};

export const UB_HEIGHT: Readonly<Record<UbSpace, string>> = {
  0: 'h-0',
  0.5: 'h-0.5',
  1: 'h-1',
  1.5: 'h-1.5',
  2: 'h-2',
  2.5: 'h-2.5',
  3: 'h-3',
  4: 'h-4',
  5: 'h-5',
  6: 'h-6',
  8: 'h-8',
  10: 'h-10',
};

export const UB_WIDTH: Readonly<Record<UbSpace, string>> = {
  0: 'w-0',
  0.5: 'w-0.5',
  1: 'w-1',
  1.5: 'w-1.5',
  2: 'w-2',
  2.5: 'w-2.5',
  3: 'w-3',
  4: 'w-4',
  5: 'w-5',
  6: 'w-6',
  8: 'w-8',
  10: 'w-10',
};

/**
 * Part 23 §23.2.2 — the compound `ds-*` type roles, named as a union so a
 * screen picks a documented tier instead of assembling one out of `text-[13px]`
 * (R-S-5). This list is the typography plugin's list, and a test asserts that.
 */
export type UbTextVariant =
  /** No tier of its own: inherit whatever the surrounding component sets. */
  | 'inherit'
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'body'
  | 'body-medium'
  | 'body-sm'
  | 'body-sm-medium'
  | 'caption'
  | 'label'
  | 'label-caps'
  | 'micro'
  | 'metric-xl'
  | 'metric-lg'
  | 'metric-md'
  | 'metric-sm'
  | 'num'
  | 'mono';

export const UB_TEXT_VARIANT: Readonly<Record<UbTextVariant, string>> = {
  inherit: '',
  display: 'ds-display',
  h1: 'ds-h1',
  h2: 'ds-h2',
  h3: 'ds-h3',
  h4: 'ds-h4',
  body: 'ds-body',
  'body-medium': 'ds-body-medium',
  'body-sm': 'ds-body-sm',
  'body-sm-medium': 'ds-body-sm-medium',
  caption: 'ds-caption',
  /**
   * §23.2.2 — the DEFAULT label tier: 12.5 px / 1.4 / 600, sentence case, no
   * tracking, rising to 13 px / 1.5 under `:lang(hi)`. Every translated label
   * uses this one.
   */
  label: 'ds-label',
  /**
   * §23.2.2 — the surviving 11 px uppercase tier, and it is LATIN-ONLY. R-S-5
   * fails it in the same element as a `t(…)` call, because Devanagari has no
   * case and `+0.09em` tracking displaces matras.
   */
  'label-caps': 'ds-label-caps',
  micro: 'ds-micro',
  'metric-xl': 'ds-metric-xl',
  'metric-lg': 'ds-metric-lg',
  'metric-md': 'ds-metric-md',
  'metric-sm': 'ds-metric-sm',
  num: 'ds-num',
  mono: 'ds-mono',
};

/**
 * §23.2.4 — the text tones, each bound to a token rather than a hex (R-S-2).
 * `error` is the LEDGER debit red; validation copy uses `formError`. They are
 * different tokens on purpose and naming them apart here is what stops a form
 * error from being painted in the receivables colour.
 */
export type UbTextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'muted'
  | 'accent'
  | 'inverse'
  | 'onNav'
  | 'onNavMuted'
  | 'success'
  | 'warning'
  | 'error'
  | 'formError'
  | 'inherit';

export const UB_TEXT_TONE: Readonly<Record<UbTextTone, string>> = {
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  tertiary: 'text-text-tertiary',
  muted: 'text-text-muted',
  accent: 'text-text-accent',
  inverse: 'text-text-inverse',
  onNav: 'text-text-onNav',
  onNavMuted: 'text-text-onNavMuted',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  formError: 'text-formError',
  inherit: '',
};

export type UbAlign = 'start' | 'center' | 'end' | 'justify';

export const UB_TEXT_ALIGN: Readonly<Record<UbAlign, string>> = {
  start: 'text-left',
  center: 'text-center',
  end: 'text-right',
  justify: 'text-justify',
};
