import type { ReactNode } from 'react';

/**
 * Part 17 §17.0.2 / Part 19 §19.2.5 — `UbDataGrid`'s contract, in one file so
 * the five rendering files below it cannot drift apart.
 *
 * The component knows about COLUMNS. It does not know what a party is
 * (§19.1.1): the feature supplies the column model, the translated labels and
 * the server-side paging state, and gets back three renderings of the same
 * model. Domain knowledge starts at the feature boundary.
 */

/**
 * Which rendering the current viewport gets. The names are the decisions, not
 * the pixel widths, because the pixel widths are an implementation detail of
 * `useGridTier` and the decisions are the approved design:
 *
 *  - `cards`   (< md, 768) — the merchant on a 360 px phone in the shop.
 *  - `compact` (md–lg)     — a table, priority columns only.
 *  - `full`    (>= lg)     — a table, every column, selection and row actions.
 */
export type UbGridTier = 'cards' | 'compact' | 'full';

/**
 * 1 is the most important column and is never dropped; 5 is the first to go.
 *
 * **The priority list is the design.** A column earns a low number by
 * supporting the decision the reader is making on THIS screen, not by being a
 * field the API happens to return. The grid drops from the highest number
 * (lowest priority) downwards as width shrinks, so a change of mind about what
 * matters is a change of one number rather than a new breakpoint.
 */
export type UbColumnPriority = 1 | 2 | 3 | 4 | 5;

/** Numbers right, everything else left. Part 23 §23.2.6. */
export type UbColumnAlign = 'start' | 'end';

/**
 * Where this column's value lands in the `< md` CARD rendering.
 *
 *  - `title`    — the row's heading; exactly one column may claim it.
 *  - `meta`     — the supporting facts under the title (at most two are read).
 *  - `trailing` — the figure on the right; exactly one column may claim it.
 *  - `none`     — the column exists for the table only and the card omits it.
 *
 * A card that shows everything a table row shows is a table row with the
 * columns stacked, which is the failure this rendering exists to avoid.
 */
export type UbCardSlot = 'title' | 'meta' | 'trailing' | 'none';

export interface UbDataGridColumn<TRow> {
  /** Stable id; also the `<th>`'s `id` and the cell's `headers` reference. */
  readonly id: string;
  /** Already translated by the feature — a `Ub*` never reaches for intl. */
  readonly header: string;
  readonly priority: UbColumnPriority;
  readonly align?: UbColumnAlign;
  /**
   * The server ordering field (Part 22's `ordering=`). Present means sortable;
   * absent means the header is plain text, because a sort control that does not
   * sort is worse than no control.
   */
  readonly sortField?: string;
  readonly cell: (row: TRow) => ReactNode;
  /** Defaults to `meta`: a column with no stated card role is a supporting fact. */
  readonly cardSlot?: UbCardSlot;
  /**
   * A `table-fixed` width class (`w-[22%]`, `w-32`). Optional: the remaining
   * columns share what is left. Tokens and Tailwind scale only, never a hex.
   */
  readonly widthClassName?: string;
  /**
   * The header text is for screen readers only — a column of icon actions.
   * The `<th>` is still a real `<th scope="col">`; only its text is hidden.
   */
  readonly headerHidden?: boolean;
}

/** Server-driven sort, mirrored into `aria-sort` on the header cell. */
export interface UbGridSort {
  readonly columnId: string;
  readonly direction: 'asc' | 'desc';
}

export interface UbGridPage {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

/**
 * Every string the grid paints, supplied by the feature. Part 23 §23.3: a
 * `Ub*` takes translated copy as props and owns none of it, which is what
 * keeps the design system portable across the white-label partners of Part 24.
 */
export interface UbDataGridLabels {
  readonly loading: string;
  /** `{page}` and `{pages}` are substituted; already localised numerals. */
  readonly pageOf: string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly pageSize: string;
  /** `Go to page {page}` — the accessible name of a page-number button. */
  readonly goToPage: string;
  /** `of {total}` — the row count beside the page-size selector. */
  readonly ofTotal: string;
  readonly selectAll: string;
  /** `{name}` is substituted with `rowName(row)`. */
  readonly selectRow: string;
  readonly sortBy: string;
  readonly sortedAscending: string;
  readonly sortedDescending: string;
  /** `{name}` is substituted; the accessible name of a card's tap target. */
  readonly openRow: string;
}

export type UbGridState = 'loading' | 'error' | 'empty' | 'filtered-empty' | 'rows';
