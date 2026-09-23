import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type { PartyTag, PartyTagWithCount } from '../types/party.types';

/**
 * PTY-05 — `/parties/tags`. Part 19 §19.3.4: one function per endpoint, owning
 * the snake_case ⇄ camelCase mapping and nothing else.
 *
 * Routed under `/parties/tags`, which is registered BEFORE `/parties/{id}` on
 * the server — otherwise "tags" is read as a party id. That ordering is the
 * server's business; it is noted here because the path looks like a detail
 * route and a reader is entitled to wonder.
 */

const TAGS = API_PATHS.PARTY_TAGS;

interface TagApiRow {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  /**
   * Absent on the write paths' responses, and that is deliberate on the server:
   * a tag that was just created has an UNKNOWN count, not a count of zero, and
   * a default here would put a confident "0 parties" beside a tag the merchant
   * created from a form that is about to attach it to one.
   */
  readonly party_count?: number;
}

const toTag = (row: TagApiRow): PartyTag => ({
  id: row.id,
  name: row.name,
  color: row.color,
});

const toTagWithCount = (row: TagApiRow): PartyTagWithCount => ({
  ...toTag(row),
  partyCount: row.party_count ?? 0,
});

/**
 * Every tag, with how many LIVE parties carry it.
 *
 * Unpaginated by design — the tenant ceiling is 200, which is one small
 * response, and the picker wants all of them at once so that opening it twice
 * does not cost two round trips.
 *
 * The snackbar is left ON, unlike the party list's: this is never the only
 * thing on a screen. It fails behind a picker or beside a manager that has its
 * own empty state, so a toast is the only place the reason can be said.
 */
export const listTags = async (
  params: { readonly q?: string; readonly includeArchived?: boolean } = {},
  signal?: AbortSignal
): Promise<readonly PartyTagWithCount[]> => {
  const query = toQueryString({
    q: params.q || undefined,
    include_archived: params.includeArchived ? 'true' : undefined,
  });
  const response = await api.get<{ data: readonly TagApiRow[] }>(
    `${TAGS}${query}`,
    ubConfig({ signal })
  );
  return response.data.data.map(toTagWithCount);
};

/**
 * `POST /parties/tags` — 201 for a new tag, 200 for one that already existed.
 *
 * Both are successes and neither is an error, which is what makes the picker's
 * create-inline safe to press twice: a merchant typing "Camp Area" into two
 * party forms wants the tag, not a message about having asked before. The
 * `created` flag is returned so a caller that cares — the manager, which says
 * "Tag created" — can tell the difference.
 */
export const createTag = async (
  name: string,
  color: string | null
): Promise<{ readonly tag: PartyTag; readonly created: boolean }> => {
  const response = await api.post<{ data: TagApiRow }>(
    TAGS,
    { name, ...(color ? { color } : {}) },
    ubConfig({})
  );
  return { tag: toTag(response.data.data), created: response.status === 201 };
};

/**
 * `PATCH /parties/tags/{id}` — rename, recolour, or both.
 *
 * `color: null` CLEARS the colour and an omitted `color` leaves it alone, which
 * is why the parameter is optional rather than nullable: the two have to stay
 * distinguishable all the way to the wire, and a single `string | null` cannot
 * carry three states.
 *
 * A rename on to a name that already exists answers 409 `tag_name_taken` with
 * `details.existing_tag_id`, so the caller can offer the merge instead of
 * making the merchant work out that the two are one thing.
 */
export const updateTag = async (
  id: string,
  changes: { readonly name?: string; readonly color?: string | null }
): Promise<PartyTag> => {
  const response = await api.patch<{ data: TagApiRow }>(
    `${TAGS}/${id}`,
    {
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.color !== undefined ? { color: changes.color } : {}),
    },
    ubConfig({})
  );
  return toTag(response.data.data);
};

/**
 * How many parties would lose this label — WITHOUT deleting it.
 *
 * The confirm dialog has to say "it will be removed from 34 parties", the
 * number has to be the server's, and asking for it must not be a second way to
 * delete something. Hence a flag on the DELETE route rather than a GET that
 * would have been mistaken for one.
 */
export const countTagParties = async (id: string, signal?: AbortSignal): Promise<number> => {
  const response = await api.delete<{ data: { party_count: number } }>(
    `${TAGS}/${id}?dry_run=true`,
    ubConfig({ signal })
  );
  return response.data.data.party_count;
};

/** `DELETE /parties/tags/{id}` — removes the label. Every party survives (BR-5). */
export const deleteTag = async (id: string): Promise<void> => {
  await api.delete(`${TAGS}/${id}`, ubConfig({}));
};

export interface TagMergeResult {
  readonly tag: PartyTag;
  readonly moved: number;
  readonly skippedDuplicates: number;
}

/**
 * `POST /parties/tags/{id}/merge` — move every party on to `intoId`, then
 * delete this tag.
 *
 * One-directional and destructive to the source, which is why the dialog states
 * both numbers before it runs and why they come back afterwards: a merchant who
 * was told "12 will move, 3 already have it" should see the same arithmetic in
 * the confirmation.
 */
export const mergeTags = async (id: string, intoId: string): Promise<TagMergeResult> => {
  const response = await api.post<{
    data: TagApiRow;
    meta: { moved: number; skipped_duplicates: number };
  }>(`${TAGS}/${id}/merge`, { into_tag_id: intoId }, ubConfig({}));
  return {
    tag: toTag(response.data.data),
    moved: response.data.meta.moved,
    skippedDuplicates: response.data.meta.skipped_duplicates,
  };
};

export type BulkTagMode = 'add' | 'replace' | 'remove';

export interface BulkTagSkip {
  readonly id: string;
  /**
   * The party's name, for a party this tenant HAS. Empty for `not_found`,
   * where there is nothing to name — inventing a label for a row the tenant
   * cannot see would be a leak, and the dialog words that case differently.
   */
  readonly name: string;
  /** `not_found` or `tag_limit_reached`. */
  readonly reason: string;
}

/** A party and the tags this call actually wrote to or deleted from it. */
export interface BulkTagChange {
  readonly partyId: string;
  readonly tagIds: readonly string[];
}

export interface BulkTagResult {
  /**
   * Parties CHANGED, not parties matched.
   *
   * It used to be the size of the selection, which is how removing a tag from
   * forty selected parties that three of them carried reported "Removed from
   * 40 parties". Nothing was wrong with the data; the sentence was false.
   */
  readonly updatedCount: number;
  /**
   * Exactly what was written, per party — and what makes Undo exact (BR-11).
   *
   * Undoing an `add` by removing the same tags from the same parties strips the
   * tag from everybody who ALREADY had it: a label that predated the operation
   * disappears, under a message saying "put back the way it was". This lists
   * only the pairs the call created, so the inverse touches only them.
   */
  readonly changed: readonly BulkTagChange[];
  /**
   * Returned for `replace` only, and it is what makes Undo EXACT (BR-11).
   * Replacing throws away tag sets that differ per party, so an inverse built
   * from "the tag we added" would restore the wrong thing on every party that
   * had something else.
   */
  readonly previous: readonly { readonly partyId: string; readonly tagIds: readonly string[] }[];
  readonly skipped: readonly BulkTagSkip[];
}

/**
 * `POST /parties/tags/bulk` — add, replace or remove across a selection.
 *
 * Names rather than ids, because the dialog's picker creates inline: a merchant
 * who types "Route 2" and presses Add should not need a round trip to turn it
 * into an id before the bulk call can run.
 *
 * `skipped` names every party the server did not touch and why — an id from
 * another tenant, or a party already carrying ten tags. It is rendered rather
 * than counted: "38 of 40" with no list is a message that sends the merchant
 * looking through forty rows to find the two.
 */
export const bulkTagParties = async (
  partyIds: readonly string[],
  tagNames: readonly string[],
  mode: BulkTagMode
): Promise<BulkTagResult> => {
  const response = await api.post<{
    data: {
      updated_count: number;
      previous: readonly { party_id: string; tag_ids: readonly string[] }[];
      changed: readonly { party_id: string; tag_ids: readonly string[] }[];
      skipped: readonly BulkTagSkip[];
    };
  }>(`${TAGS}/bulk`, { party_ids: [...partyIds], tag_names: [...tagNames], mode }, ubConfig({}));
  const { data } = response.data;
  return {
    updatedCount: data.updated_count,
    previous: data.previous.map((entry) => ({
      partyId: entry.party_id,
      tagIds: entry.tag_ids,
    })),
    /* `?? []` because a server older than this client sends no `changed`, and
       an absent list has to mean "nothing to undo exactly" rather than throw —
       `usePartyBulkTag` then offers no Undo, which is the honest degradation. */
    changed: (data.changed ?? []).map((entry) => ({
      partyId: entry.party_id,
      tagIds: entry.tag_ids,
    })),
    skipped: data.skipped,
  };
};
