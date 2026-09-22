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
   * This column's share of the table, as a WEIGHT rather than a width.
   *
   * The numbers are relative: `34` beside `12` means about three times as wide,
   * and the grid normalises whatever set it ends up painting to 100% (see
   * `columnWidths`). That is the point — a column model is rendered at three
   * tiers and through a column menu, so the set on screen is rarely the set the
   * widths were written for, and a screen that states absolute percentages is
   * doing an arithmetic it does not have the facts for.
   *
   * Omitted on every column means an equal-width table, which `table-fixed`
   * already gives.
   */
  readonly widthShare?: number;
  /**
   * Whether the column menu may switch this column off. Defaults to
   * `priority > 1` — see `isHideable`. A screen sets it explicitly only when it
   * knows something the priority number does not.
   */
  readonly hideable?: boolean;
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
  /** `Showing` — the word before the page-size control. BrandHub's bar reads
   *  "Showing [25] of 1,234"; a bare number says nothing about what it counts. */
  readonly showing: string;
  /**
   * `2 selected` — the selection bar's label, ALREADY RESOLVED, count and all.
   *
   * The one label on this interface that is not a template, and deliberately
   * so. It is an ICU plural, and ICU must see the number to pick the form —
   * Hindi's one and other differ. A feature that hands over
   * `t('…', { count: '{count}' })` and expects the grid to fill the blank gets
   * "NaN selected", because `#` was evaluated against a string.
   */
  readonly selectedCount: string;
  readonly selectAll: string;
  /** `{name}` is substituted with `rowName(row)`. */
  readonly selectRow: string;
  /** The column-menu trigger, and the panel's accessible name. */
  readonly columns: string;
  /** The menu's reset row — puts every column the tier allows back. */
  readonly showAllColumns: string;
  readonly sortBy: string;
  readonly sortedAscending: string;
  readonly sortedDescending: string;
  /** `{name}` is substituted; the accessible name of a card's tap target. */
  readonly openRow: string;
}

export type UbGridState = 'loading' | 'error' | 'empty' | 'filtered-empty' | 'rows';
