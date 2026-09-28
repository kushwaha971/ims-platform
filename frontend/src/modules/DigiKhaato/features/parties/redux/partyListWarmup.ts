import type { AppDispatch } from 'src/redux/store';

import { fetchPartyList, type FetchPartyListArg } from './partyListThunk';

/**
 * Part 19 §19.9.1 — **the list fetch is gated on RENDERING, not on the session.**
 *
 * The measured defect: `app/layout.tsx` mounts `SessionBootstrap`, which fires
 * `GET /auth/me`; `app/(app)/layout.tsx` wraps every app route in
 * `RequireSession`, which renders a skeleton — not `children` — until that
 * returns. `PartyListPageContent` is a child, so `usePartyList`'s effect could
 * not fire until the session had resolved. Two serial round trips at the
 * specified 150 ms RTT is 0.6–0.8 s, and time to the first party row landed
 * near **3.3 s** against §19.9.1's P75 budget of **1.2 s**.
 *
 * The guard itself is right and is untouched. What a signed-out visitor is
 * ALLOWED TO SEE has not changed by one pixel: `RequireSession` still paints a
 * skeleton and still never flashes the app. What changed is that the request
 * for the rows now leaves the device at the same moment the request for the
 * session does, so the two round trips overlap instead of queueing.
 *
 * ── Why a speculative fetch is safe here ────────────────────────────────────
 *
 *  · `proxy.ts` has already redirected a cookie-less request to `/login`
 *    before any JavaScript shipped, so everyone who reaches this code is
 *    holding a session cookie.
 *  · If the cookie turns out to be dead, `AxiosInstances` answers the 401 with
 *    its single-flight refresh and, failing that, `sessionExpired` — the same
 *    path the session fetch itself takes. The speculative request costs one
 *    round trip that was already going to be spent on the redirect.
 *
 * ── Why a claim, and not a "skip if already loading" ────────────────────────
 *
 * `usePartyList` refetches on mount, by design. If the warm request had merely
 * been left to race, the hook would mount either DURING it (harmless) or just
 * AFTER it (a second identical GET, on the connection this whole exercise is
 * trying to unload) depending on which of the two round trips won — a coin
 * toss, which is not a behaviour.
 *
 * So the warm-up is CLAIMABLE exactly once, by key. The hook's first effect for
 * the same parameters takes the warm request over — settled or in flight —
 * instead of issuing its own, and keeps the abort handle so a filter change
 * mid-flight still cancels it. Every later fetch is an ordinary dispatch. One
 * request either way, and no dependence on which response arrives first.
 */

const dispatchFetch = (dispatch: AppDispatch, arg: FetchPartyListArg) =>
  dispatch(fetchPartyList(arg));

/** RTK's dispatch return for this thunk: a promise carrying `.abort()`. */
type PartyListRequest = ReturnType<typeof dispatchFetch>;

/**
 * Identifies "the same request" — over EVERY parameter, derived rather than
 * listed.
 *
 * This used to name its fields: `q`, `status`, `ordering`, `page`, `pageSize`,
 * on the reasoning that a key change should be a deliberate edit here. The
 * reasoning was backwards. PTY-02 added `type`, `balance` and `collection` to
 * the params and did not add them here, and the failure was silent and total:
 * an arg with `balance: 'owes_me'` produced the same key as the warm request,
 * `claimWarmPartyList` answered "already in flight", and `usePartyList`
 * returned without dispatching. Tapping a chip set the pressed state, lit up
 * "Clear filters (1)", relabelled the count tile "Matching your filters" — and
 * issued no request. The list never filtered, and because the claim is
 * idempotent it never filtered again for the life of the page.
 *
 * Nothing failed. The unit tests prime no warm-up, so `claimWarmPartyList`
 * returns false in jsdom and the dispatch they assert really does happen; the
 * warm-up's own tests key off the DEFAULT filters, which have not changed. It
 * took opening the screen and watching the network panel stay empty.
 *
 * So the key now covers whatever `params` holds. Sorting the entries keeps the
 * property the explicit list was actually there for — that key order in the
 * object cannot change the answer — without the property that a new filter is
 * invisible until someone remembers this file.
 */
export const partyListRequestKey = ({ params, mode }: FetchPartyListArg): string =>
  [
    mode,
    ...Object.entries({ ...params } as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([name, value]) => `${name}=${String(value)}`),
  ].join('\u0000');

let warmed: { key: string; request: PartyListRequest; claimed: boolean } | null = null;

/**
 * Starts the list request now. Called from ABOVE the session guard, so it runs
 * in the same commit as `SessionBootstrap`'s own effect and the two requests
 * leave together.
 *
 * The `claimed` flag is what makes this safe to call repeatedly, and it has to
 * distinguish two callers that look identical from here:
 *
 *  · **React Strict Mode** mounts, unmounts and remounts every effect in
 *    development, so this is called twice for one visit. The warm request has
 *    not been claimed yet, so the second call is a no-op and the merchant's
 *    connection sees one GET in development exactly as it does in production.
 *  · **Coming back to the screen** — `/parties → /dashboard → /parties` — is
 *    also the same key, but by then the first request has been claimed and its
 *    rows are old. That supersedes: the stale one is aborted and a fresh one
 *    goes out, which is the refetch-on-mount the screen has always had.
 */
export function warmPartyList(dispatch: AppDispatch, arg: FetchPartyListArg): void {
  const key = partyListRequestKey(arg);
  if (warmed?.key === key && !warmed.claimed) return;
  warmed?.request.abort();
  warmed = { key, request: dispatchFetch(dispatch, arg), claimed: false };
}

/**
 * Tells the screen that the request it was about to make is already in flight.
 *
 * Returns `true` when the warm request is exactly this one, in which case the
 * caller must NOT dispatch and must NOT abort on cleanup: the warm-up owns that
 * request's lifetime, and a Strict Mode teardown aborting it would throw away a
 * round trip that has already been spent. It is idempotent for the same reason
 * — asking twice gives the same answer.
 */
export function claimWarmPartyList(arg: FetchPartyListArg): boolean {
  if (warmed?.key !== partyListRequestKey(arg)) return false;
  warmed.claimed = true;
  return true;
}

/**
 * Supersedes the warm request. The screen calls this before dispatching
 * anything the warm-up did not predict — a filter, a page, a sort — so that a
 * slow speculative page 1 can never land on top of the page the merchant
 * actually asked for. That guarantee used to come from the hook aborting its
 * own promise, and this is the same guarantee for a promise it does not own.
 */
export function abortWarmPartyList(): void {
  warmed?.request.abort();
  warmed = null;
}

/** Test seam. */
export const __resetPartyListWarmup = abortWarmPartyList;
