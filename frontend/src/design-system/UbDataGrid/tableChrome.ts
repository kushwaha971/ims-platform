/**
 * The table's class strings, in one file, because two components now paint the
 * same table.
 *
 * `UbDataGridTable` paints it with rows in it. `UbDataGridStateTable` paints the
 * SAME table while the rows are still being fetched, and when there are none —
 * and the only reason that is worth doing (see that file) is that the two are
 * pixel-identical. A skeleton whose columns are 4 px narrower than the real
 * ones is a layout shift wearing a disguise, and it is exactly the kind of
 * difference that appears six months after someone edits one `px-3` and not the
 * other.
 *
 * So the strings live here and neither component owns them. The guard in
 * `UbDataGrid.test.tsx` asserts both files reference these constants rather than
 * spelling the classes out again.
 */

/** Numbers right, everything else left. Part 23 §23.2.6. */
export const ALIGN = { start: 'text-left', end: 'text-right' } as const;

export const GRID_SCROLLER = 'w-full min-w-0';

export const GRID_TABLE = 'w-full border-collapse';

/**
 * BrandHub's `TableHeader` is `bg-[#fafafa]` with a hairline under it, and the
 * tint is what actually separates the head from the body — a header the same
 * colour as the rows relies entirely on font weight, which at 13 px is not
 * much. `surface-sunken` is this product's token for the same near-white.
 */
export const GRID_THEAD = 'sticky top-0 z-10 bg-surface-sunken';

export const GRID_HEAD_ROW = 'border-b border-border-hairline';

export const GRID_TH =
  'ds-body-sm-medium h-12 select-none whitespace-nowrap px-3 py-2 align-middle text-text-primary';

/** The checkbox column: fixed at 48 px so the name column starts in one place. */
export const GRID_SELECT_CELL = 'w-12 px-3 py-2';

/**
 * Row hover and the 56 px height are departures from BrandHub, kept
 * deliberately: BrandHub has neither a hover rule nor striping and its rows are
 * 48 px. Hover is how a mouse keeps its place across a wide table, and the extra
 * 8 px is a comfortable touch row rather than a minimal one.
 */
export const GRID_ROW = 'h-14 border-b border-border-hairline transition-colors last:border-b-0';

export const GRID_TD = 'ds-body-sm truncate px-3 py-2 align-middle text-text-primary';
