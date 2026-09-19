/** Part 22 §22.1 caps page_size at 100; 25 is the documented default. */
export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS: readonly number[] = [25, 50, 100];
/** Desktop bulk selection is capped so a "select all" cannot post 10k ids. */
export const SELECTION_CAP = 200;
/** PTY-02 FR-7's whitelist starts here; Sprint 0 needs only the default. */
export const DEFAULT_ORDERING = '-last_activity_at';
