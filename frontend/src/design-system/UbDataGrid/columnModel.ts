import type { UbCardSlot, UbColumnPriority, UbDataGridColumn, UbGridTier } from './types';

/**
 * The priority rule, as a pure function, so it is unit-testable without a DOM
 * and so the drop ORDER is a fact of the codebase rather than a claim in a
 * comment.
 *
 * Two rules, and only two:
 *
 *  1. **`full` shows everything.** At >= lg there is room, and the accountant
 *     reconciling on a desktop wants the whole record.
 *  2. **`compact` keeps priority <= `compactCutoff` and drops the rest, lowest
 *     priority first.** The default cutoff is 2 because at md–lg a table gets
 *     roughly three readable columns before type has to go below 13 px, and
 *     Part 23 §23.3 will not paint a semantic colour below `ds-body-sm`.
 *
 * There is deliberately no measurement here. A grid that measures its own
 * columns and hides whichever overflows produces a different table on every
 * screen, which is not a design — it is an accident that happens to fit.
 */
export const COMPACT_PRIORITY_CUTOFF: UbColumnPriority = 2;

export const visibleColumns = <TRow,>(
  columns: readonly UbDataGridColumn<TRow>[],
  tier: UbGridTier,
  compactCutoff: UbColumnPriority = COMPACT_PRIORITY_CUTOFF
): readonly UbDataGridColumn<TRow>[] => {
  if (tier === 'full') return columns;
  // `cards` never renders a table; the cutoff still describes what a card reads.
  if (tier === 'cards') return columns.filter((column) => cardSlotOf(column) !== 'none');
  return columns.filter((column) => column.priority <= compactCutoff);
};

/**
 * The order columns are given up in, worst first. Exported because the test
 * that guards the drop order asserts against THIS, not against a hand-written
 * list that can quietly disagree with the grid.
 *
 * Ties are broken by the author's order, so two priority-3 columns drop
 * right-to-left rather than in whatever order `sort` felt like.
 */
export const dropOrder = <TRow,>(
  columns: readonly UbDataGridColumn<TRow>[]
): readonly string[] =>
  columns
    .map((column, index) => ({ id: column.id, priority: column.priority, index }))
    .sort((a, b) => b.priority - a.priority || b.index - a.index)
    .map((entry) => entry.id);

export const cardSlotOf = <TRow,>(column: UbDataGridColumn<TRow>): UbCardSlot =>
  column.cardSlot ?? 'meta';

export interface UbCardModel<TRow> {
  readonly title: UbDataGridColumn<TRow> | null;
  readonly trailing: UbDataGridColumn<TRow> | null;
  readonly meta: readonly UbDataGridColumn<TRow>[];
}

/**
 * The card rendering's three slots, resolved once.
 *
 * `meta` is capped at two entries on purpose. The approved rule is three facts
 * per row — a title, a figure and one or two supporting lines — and a card that
 * grows a fourth fact stops being scannable at exactly the moment a merchant is
 * standing at a counter with a customer waiting.
 */
export const MAX_CARD_META = 2;

export const cardModel = <TRow,>(
  columns: readonly UbDataGridColumn<TRow>[]
): UbCardModel<TRow> => {
  const title = columns.find((column) => cardSlotOf(column) === 'title') ?? null;
  const trailing = columns.find((column) => cardSlotOf(column) === 'trailing') ?? null;
  const meta = columns
    .filter((column) => cardSlotOf(column) === 'meta')
    .slice(0, MAX_CARD_META);
  return { title, trailing, meta };
};

/** `"Select {name}"` with `{name}` → `Ramesh Traders`. No intl in a `Ub*`. */
export const fillTemplate = (
  template: string,
  values: Readonly<Record<string, string | number>>
): string =>
  Object.entries(values).reduce<string>(
    (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
    template
  );

/**
 * Whether the column menu may switch this column off.
 *
 * The default ties it to the priority list rather than inventing a second
 * opinion: **priority 1 is the column the screen cannot be read without** —
 * `visibleColumns` never drops it for width, so the menu does not drop it
 * either. Every other column is the reader's to hide.
 *
 * `hideable` on the column overrides both directions, for the screen that knows
 * something the priority number does not.
 */
export const isHideable = <TRow,>(column: UbDataGridColumn<TRow>): boolean =>
  column.hideable ?? column.priority > 1;

/**
 * The rendered columns' widths, as CSS percentages that always total 100.
 *
 * ── Why the grid computes this instead of the screen writing it down ────────
 * Because a column model is rendered at three tiers and now with a column menu
 * on top of that, so the SET being painted is not the set the widths were
 * written for. The party list declared 34/20/16/18/12 — correct for five
 * columns — and then:
 *
 *  · at `compact` only three of them render, so the table claimed 70% of its
 *    own width and stopped, leaving a quarter of the card empty to the right;
 *  · with a column switched off, the same gap opened at `full`;
 *  · and the selection checkbox, a fixed 48 px no percentage knows about, took
 *    its width out of whichever column had been left unsized — which is how
 *    "Code and mobile" came to be 36 px wide with its header overlapping the
 *    next one.
 *
 * All three are the same defect: an arithmetic the screen cannot do, because
 * the screen does not know what will be rendered. So the screen states a
 * WEIGHT — "the name column is about twice the status column" — and the grid
 * normalises the weights of the columns it is actually painting. A tier change
 * and a hidden column then rescale the table instead of shrinking it.
 *
 * `table-fixed` resolves these against the table's width and scales them down
 * to make room for the checkbox column, so the 48 px is spread across every
 * column in proportion rather than taken out of one.
 */
export const columnWidths = <TRow,>(
  columns: readonly UbDataGridColumn<TRow>[]
): readonly string[] => {
  const shares = columns.map((column) => column.widthShare ?? 0);
  const total = shares.reduce((sum, share) => sum + share, 0);
  // No weights at all is a legitimate model — an equal-width table — and
  // `table-fixed` already does that, so nothing is stated.
  if (total <= 0) return columns.map(() => '');
  return shares.map((share) =>
    // A column with no weight in a model that has them keeps `auto` and shares
    // what the weighted ones leave. The guard test below prefers all-or-none,
    // but a partial model must still render.
    share > 0 ? `${((share / total) * 100).toFixed(4)}%` : ''
  );
};
