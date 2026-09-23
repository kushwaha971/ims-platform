'use client';

import { useEffect, useRef } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

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
  'ordering',
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

  return patch as Partial<PartyListFilters>;
};

/** The query string this filter set should be at, with defaults omitted. */
export const writeFilters = (filters: PartyListFilters, defaults: PartyListFilters): string => {
  const params = new URLSearchParams();
  for (const key of URL_KEYS) {
    const value = String(filters[key] ?? '');
    /* Defaults are left OUT, so an untouched list has a clean `/parties` and a
       shared link carries only what the sender actually chose. A URL full of
       `&type=&balance=` is a URL nobody can read, which defeats the point. */
    if (!value || value === String(defaults[key] ?? '')) continue;
    params.set(key, value);
  }
  return params.toString();
};

export interface UsePartyListUrlOptions {
  readonly filters: PartyListFilters;
  readonly defaults: PartyListFilters;
  readonly onSeed: (patch: Partial<PartyListFilters>) => void;
}

export function usePartyListUrl({ filters, defaults, onSeed }: UsePartyListUrlOptions): void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const patch = readFilters(new URLSearchParams(searchParams?.toString() ?? ''));
    if (Object.keys(patch).length > 0) onSeed(patch);
  }, [searchParams, onSeed]);

  useEffect(() => {
    /* Not before the seed has run, or the first pass would write the DEFAULTS
       over the very link that was being opened. */
    if (!seeded.current) return;
    const next = writeFilters(filters, defaults);
    const current = searchParams?.toString() ?? '';
    if (next === current) return;
    /* `replace`, not `push`: a chip tap is a refinement of the screen the
       merchant is on, not a place they navigated to. Pushing would make Back
       walk them through every chip they tried instead of returning them to
       wherever they came from. `scroll: false` keeps the list where they were
       reading it. */
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [filters, defaults, pathname, router, searchParams]);
}
