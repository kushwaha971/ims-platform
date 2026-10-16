'use client';

import { useMediaQuery } from 'src/design-system/motion/useMediaQuery';

/**
 * WP-05 layout A (owner's choice, 16 Oct 2026) — a document editor keeps its
 * totals panel BESIDE the lines only from 1536 px. Below it the totals go under
 * the lines, so the lines get the width a table needs, and the grand total and
 * the finishing actions ride in a `UbTotalDock`. One query, so the sales and
 * purchase editors cannot disagree about where that happens.
 */
export const DOCKED_TOTALS_QUERY = '(max-width: 1535.98px)';

export const useDocksEditorTotals = (): boolean => useMediaQuery(DOCKED_TOTALS_QUERY);

/**
 * The totals panel's place in that layout: under the lines and right-aligned at
 * a readable width from 1024 to 1535 px (full width, its amounts were 1,000 px
 * from their labels at 1280), and sticky beside the lines from 1536 px.
 */
export const EDITOR_TOTALS_PANEL_CLASS =
  'lg:max-2xl:w-full lg:max-2xl:max-w-lg lg:max-2xl:justify-self-end 2xl:sticky 2xl:top-4';
