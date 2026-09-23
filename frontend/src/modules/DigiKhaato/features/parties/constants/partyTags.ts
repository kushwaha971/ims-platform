/**
 * PTY-05's ceilings and palette, restated on the client.
 *
 * Imports NOTHING, for the same reason `partyFilters.ts` does not: these are
 * read by the party form, the list filter, the bulk dialog and the manager, and
 * a constants module that reaches for a component or a service would drag it
 * into every one of those bundles.
 *
 * These numbers are the SERVER's — it enforces them and its 400 is the real
 * answer. They are here so that a merchant is told at the control rather than
 * after a round trip, which is the difference between a picker that stops
 * offering an eleventh tag and a form that accepts one and then refuses to
 * save. When the two disagree the server wins and the copy says so.
 */

/** BR-3. Ten labels is already past where chips stay scannable in a list row. */
export const MAX_TAGS_PER_PARTY = 10;

/** FR-13. A product constraint rather than a plan limit; an upgrade does not lift it. */
export const MAX_TAGS_PER_TENANT = 200;

/** FR-8. Two hundred explicit ids is a selection; past that it is a filter's job. */
export const MAX_BULK_TAG_PARTIES = 200;

/** FR-8 — how many tags one bulk call may apply. */
export const MAX_BULK_TAG_NAMES = 5;

/**
 * How many chips a list row shows before the rest become "+3", by rendering.
 *
 * ── One, on a phone ─────────────────────────────────────────────────────────
 * The card's title column is about 180 px wide at 360 px, and two chips in it
 * either shrink to four letters each or run off the edge. One chip and a count
 * is the honest reading of the same information: the merchant learns which
 * group this party is in and that there is more, and the khata page — one tap
 * away, and where they are going anyway — shows all of it.
 *
 * Two on a table, where the name column is around 370 px and two fit easily.
 */
export const TAG_CHIPS_PER_ROW = { cards: 1, compact: 2, full: 2 } as const;
