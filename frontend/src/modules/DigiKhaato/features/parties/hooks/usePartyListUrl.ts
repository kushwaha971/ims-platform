'use client';

import { seedListPatch, useListUrl, writeListQuery, type ListUrlCodec } from 'src/hooks/useListUrl';

import type { PartyListFilters } from '../types/party.types';

/**
 * PTY-02/PTY-05 — the party list's filters, in the address bar.
 *
 * ── Why this exists, and what was broken without it ─────────────────────────
 * PTY-05's tag manager shows "Camp Area · 34" and makes the count a link to
 * `/parties?tag=Camp Area`. It went to an unfiltered list, because nothing on
 * this screen had ever read the URL: the filters lived only in Redux, seeded
 * from their defaults on every mount. The link was not subtly wrong, it was
 * inert — and the tag filter's own documentation claimed the parameter was
 * "something a person can read, edit and send to somebody", which was not true
 * of any of it.
 *
 * Fixing only `tag` would have been smaller and dishonest: the four axes are
 * one control row and a merchant who can share a tag filter and not a balance
 * filter has learnt a rule with no reason behind it.
 *
 * ── Read once, write always ─────────────────────────────────────────────────
 * The URL seeds the slice on the FIRST mount and never again — after that the
 * slice is the single source of truth and the URL follows it. Reading
 * continuously would mean two writers for one piece of state and a loop between
 * them; reading never would mean a link that works once and an address bar that
 * lies for the rest of the session.
 *
 * ── On mount the URL is the WHOLE answer, not a patch (UAT D7) ──────────────
 * The slice outlives the screen (it is app-wide Redux), and the seed used to
 * apply only the axes the URL named. So a merchant who chose Archived, went to
 * a khata and then tapped "Customers" in the sidebar — a clean `/parties` —
 * got the Archived tab back, written into the address bar again, with ₹0 / ₹0
 * over one archived party and no chip lit to say why. An axis the URL does not
 * name now means its DEFAULT. Browser Back is unaffected: it returns to the
 * URL that was written, which carries every non-default axis, so the seed finds
 * nothing to change and the page number the slice kept survives too. The
 * decision, recorded: filters persist across navigation ONLY through the URL.
 *
 * ── `page` is deliberately absent ───────────────────────────────────────────
 * Every filter change resets pagination (§17.0.3), so a URL carrying both a
 * filter and a page number is a URL that is wrong the moment somebody opens it.
 * `ordering` IS carried: it survives a filter change, and "sorted by who owes
 * most" is a real thing to send somebody.
 */

/** The axes that travel in the URL, and the order they are written in. */
const URL_KEYS = [
  'q',
  'status',
  'type',
  'balance',
  'collection',
  'tag',
  'credit',
  'role',
  'ordering',
  /* DEC-019 — listed so a seed puts the PAGE's book back (an axis the URL does
     not name falls back to its default), and never read from the URL: the book
     is the page's, not the link's. It always equals the page's default, so it
     is never written either. */
  'book',
] as const;

type UrlKey = (typeof URL_KEYS)[number];

const TYPES: readonly string[] = ['customer', 'supplier'];
const BALANCES: readonly string[] = ['owes_me', 'i_owe', 'settled'];
const COLLECTIONS: readonly string[] = ['today', 'overdue', 'upcoming'];
const CREDITS: readonly string[] = ['over', 'near', 'ok'];
const STATUSES: readonly string[] = ['active', 'archived'];

/**
 * A URL is untrusted input, so every enumerated axis is checked against its own
 * closed set rather than cast.
 *
 * Not defensiveness: `type` and `balance` reach the database as query
 * parameters, and a value the client passes through is a value the client has
 * decided not to think about. An unrecognised one is DROPPED rather than
 * refused — a link with a stale spelling should show the list, not an error.
 */
const readFilters = (params: URLSearchParams): Partial<PartyListFilters> => {
  const patch: Record<string, unknown> = {};
  const take = (key: UrlKey, allowed?: readonly string[]) => {
    const raw = params.get(key);
    if (raw === null) return;
    const value = raw.trim();
    if (!value) return;
    if (allowed && !allowed.includes(value)) return;
    patch[key] = value;
  };

  take('q');
  take('status', STATUSES);
  take('type', TYPES);
  take('balance', BALANCES);
  take('collection', COLLECTIONS);
  take('credit', CREDITS);
  take('ordering');
  /* `tag` is a comma list of names and has no closed set — it is the merchant's
     own vocabulary. It is normalised (blanks dropped, spacing collapsed) so a
     hand-edited link carrying `?tag=Camp Area,,` behaves like the same link
     without the stray comma, and the server folds the case. */
  const tag = params.get('tag');
  if (tag !== null) {
    const names = tag
      .split(',')
      .map((name) => name.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    if (names.length > 0) patch.tag = names.join(',');
  }

  /* A6 — `role` is a comma list of module role CODES. Codes are slugs, so
     anything else is dropped here rather than sent to a server that would
     answer 400 for the whole list. Which codes exist is the server's to say. */
  const role = params.get('role');
  if (role !== null) {
    const codes = role
      .split(',')
      .map((code) => code.trim())
      .filter((code) => /^[a-z0-9_]{1,40}$/.test(code));
    if (codes.length > 0) patch.role = [...new Set(codes)].join(',');
  }

  return patch as Partial<PartyListFilters>;
};

/** The query string this filter set should be at, with defaults omitted. */
export const writeFilters = (filters: PartyListFilters, defaults: PartyListFilters): string =>
  /* Defaults are left OUT, so an untouched list has a clean `/parties` and a
     shared link carries only what the sender actually chose. */
  writeListQuery(URL_KEYS, filters, defaults);

/**
 * What the slice must change to show exactly what the URL says: every URL axis
 * the link names takes its value, and every one it does NOT name falls back to
 * its default (UAT D7). Only the axes that differ are returned, so a return to
 * the same URL (browser Back) is an empty patch and keeps the page the slice
 * was on — `filtersChanged` resets pagination for any non-empty one.
 */
export const seedPatch = (
  fromUrl: Partial<PartyListFilters>,
  current: PartyListFilters,
  defaults: PartyListFilters
): Partial<PartyListFilters> => seedListPatch(URL_KEYS, fromUrl, current, defaults);

/** F01 — the mechanism is `src/hooks/useListUrl` (shared with the library's lists). */
const PARTY_LIST_CODEC: ListUrlCodec<PartyListFilters> = { keys: URL_KEYS, read: readFilters };

export interface UsePartyListUrlOptions {
  readonly filters: PartyListFilters;
  readonly defaults: PartyListFilters;
  readonly onSeed: (patch: Partial<PartyListFilters>) => void;
}

export function usePartyListUrl({ filters, defaults, onSeed }: UsePartyListUrlOptions): void {
  useListUrl({ codec: PARTY_LIST_CODEC, filters, defaults, onSeed });
}
