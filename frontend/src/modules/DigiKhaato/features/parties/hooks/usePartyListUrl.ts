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
): Partial<PartyListFilters> => {
  const patch: Record<string, unknown> = {};
  for (const key of URL_KEYS) {
    const wanted = fromUrl[key] ?? defaults[key];
    if (wanted !== current[key]) patch[key] = wanted;
  }
  return patch as Partial<PartyListFilters>;
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
  /* The string, not the object: `useSearchParams()` may hand back a new
     object on every render, and an effect keyed on it would re-run for a URL
     that did not change. */
  const current = searchParams?.toString() ?? '';
  /** The query this hook last SAW in the address bar; null before the seed. */
  const observed = useRef<string | null>(null);
  /** Queries this hook asked the router for and has not yet seen arrive. */
  const requested = useRef<string[]>([]);

  useEffect(() => {
    /* Is this address the merchant's doing or ours?
       - The first run is a mount: the URL is what was opened, so it is read.
       - A later change to a query WE requested is our own `replace` arriving;
         everything requested up to it is settled.
       - A later change to anything else is a navigation from outside while
         the screen stayed mounted — the sidebar's "Customers" (a clean
         `/parties`) tapped while already on `/parties?status=archived`. It is
         read like a mount, or the writer below would put the Archived tab
         straight back over the default view the merchant asked for (UAT D7). */
    let fromOutside = observed.current === null;
    if (observed.current !== null && current !== observed.current) {
      const index = requested.current.lastIndexOf(current);
      if (index >= 0) requested.current.splice(0, index + 1);
      else fromOutside = true;
    }
    observed.current = current;

    if (fromOutside) {
      requested.current = [];
      const patch = seedPatch(readFilters(new URLSearchParams(current)), filters, defaults);
      /* Nothing is written in this pass: `filters` here is still the
         PRE-seed value, and writing it would `replace` the very link being
         opened. The render the seed causes runs this again and writes the
         canonical form (a dropped `type=wholesaler`, say). */
      if (Object.keys(patch).length > 0) {
        onSeed(patch);
        return;
      }
    }

    const next = writeFilters(filters, defaults);
    if (next === current || requested.current.at(-1) === next) return;
    requested.current.push(next);
    /* `replace`, not `push`: a chip tap is a refinement of the screen the
       merchant is on, not a place they navigated to. Pushing would make Back
       walk them through every chip they tried instead of returning them to
       wherever they came from. `scroll: false` keeps the list where they were
       reading it. */
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [current, filters, defaults, pathname, router, onSeed]);
}
