/**
 * The khata timeline's page sizes, as the server enforces them
 * (`backend/apps/common/constants.py` `CURSOR_LIMIT_DEFAULT` / `_MAX`).
 *
 * The client names them for one reason, NEW-2's silent refresh after a write:
 * it re-reads the first page at the depth the merchant has already scrolled to,
 * so it has to know where the ordinary page ends and where the server stops
 * listening. A limit above the maximum is not refused — it is clamped — so a
 * wrong number here costs rows, never a failed request.
 */
export const TIMELINE_PAGE_SIZE = 50;
export const TIMELINE_PAGE_MAX = 200;

/**
 * How many rows the refresh should ask for, given how many are loaded: nothing
 * special up to one ordinary page, and the loaded depth beyond it, capped at
 * what the server will return in one page.
 */
export const timelineRefreshLimit = (loaded: number): number | undefined =>
  loaded <= TIMELINE_PAGE_SIZE ? undefined : Math.min(loaded, TIMELINE_PAGE_MAX);
