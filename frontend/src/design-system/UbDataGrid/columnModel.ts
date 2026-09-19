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
