/**
 * Part 19 §19.11.5 — shared, pure string helpers. The bar for living here
 * rather than in a feature's `view-model/` is that a SECOND feature needs it:
 * `initialsOf` earned it by existing twice, byte for byte, as `initialsOf` in
 * `features/parties/view-model/partyDisplay.ts` and as `tenantInitials` in
 * `features/tenant-switcher/view-model/tenantDisplay.ts`.
 *
 * No React, no Redux, no `react-intl`.
 */

/**
 * Up to two initials for an avatar, script-agnostic.
 *
 * `[...word][0]` rather than `word[0]`: `charAt` would split a Devanagari
 * grapheme and a surrogate pair down the middle, which is how "अमित" becomes a
 * replacement glyph.
 */
export const initialsOf = (name: string): string =>
  (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('');

export interface TruncatedText {
  readonly text: string;
  readonly truncated: boolean;
}

/**
 * Truncation as a DECISION, so a tooltip and the visible text cannot disagree
 * about whether one was applied (PLT-04 §7).
 */
export const truncateText = (value: string, max: number): TruncatedText =>
  value.length <= max
    ? { text: value, truncated: false }
    : { text: `${value.slice(0, max - 1)}…`, truncated: true };
