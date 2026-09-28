'use client';

import { useCallback, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { selectPartyTags } from '../redux/partyTagSlice';
import { bulkTagPartiesThunk } from '../redux/partyTagThunk';

import type { BulkTagMode, BulkTagResult } from '../api/tagService';

export interface UsePartyBulkTagResult {
  readonly canTag: boolean;
  readonly open: boolean;
  readonly saving: boolean;
  readonly undoing: boolean;
  readonly result: BulkTagResult | null;
  /** The mode the finished call used, so the report can word itself. */
  readonly appliedMode: BulkTagMode | null;
  readonly undone: boolean;
  readonly start: () => void;
  readonly close: () => void;
  readonly confirm: (tagNames: readonly string[], mode: BulkTagMode) => void;
  readonly undo: () => void;
}

/**
 * PTY-05 FR-8 / FR-9 — tag a selection, and be able to take it back.
 *
 * ── Undo lives in the dialog, not in a ten-second snackbar ──────────────────
 * DOCUMENTED DEVIATION from FR-9, which specifies "the completion snackbar
 * carries Undo for 10 s". Two reasons, and the second one is the one that
 * decided it:
 *
 * 1. This product's global snackbar takes a message and nothing else, and it is
 *    driven through the store — where `serializableCheck` is on, deliberately,
 *    so a callback cannot be put in a snackbar payload. Carrying an Undo there
 *    would mean a second, parallel toast mechanism holding live functions
 *    outside the store, for one feature.
 * 2. A ten-second window is a window a merchant on a ₹6,000 phone at a counter
 *    will miss. The action it undoes touched up to two hundred parties; the
 *    cost of missing it is opening each one. The dialog stays until dismissed,
 *    which is the same decision PTY-04's bulk archive already made for the same
 *    reason — a bulk result is something to READ, not something to glimpse.
 *
 * ── The inverse is built from what the server WROTE, not what it was asked ──
 *
 * The first version inverted an `add` by removing the same tag names from the
 * same party ids. That is wrong in a way nobody would notice until it cost
 * somebody a label: a party that already carried "Camp Area" before the
 * merchant ever pressed Add loses it on Undo, silently, under a message that
 * says "put back the way it was".
 *
 * So the server returns `changed` — the pairs it actually created or deleted —
 * and Undo works from that. Parties that were already correct are not touched,
 * because nothing was done to them.
 *
 * `replace` still has no Undo, and now for the only honest reason left: it
 * threw away tag sets that differ per party, so restoring them needs a call
 * that sends a different set per party, and this endpoint has one set for all.
 * An Undo that silently restores the wrong thing is worse than no Undo, because
 * the merchant believes it worked.
 */
/**
 * `changed` speaks in tag IDS; the bulk endpoint takes tag NAMES. Grouping by
 * the id set and translating once keeps the inverse exact without asking the
 * endpoint to grow a second shape.
 *
 * Parties whose changed tags are not in the map are dropped rather than guessed
 * at — that can only happen if the tag list is older than the response, and an
 * Undo that silently skips a party is better than one that removes the wrong
 * tag from it.
 */
const groupChanges = (
  changed: readonly { readonly partyId: string; readonly tagIds: readonly string[] }[],
  tagsById: ReadonlyMap<string, string>
): { ids: string[]; names: string[] }[] => {
  const groups = new Map<string, { ids: string[]; names: string[] }>();
  for (const entry of changed) {
    const names = entry.tagIds.map((id) => tagsById.get(id)).filter((n): n is string => Boolean(n));
    if (names.length === 0) continue;
    const key = [...entry.tagIds].sort().join('\u0000');
    const group = groups.get(key) ?? { ids: [], names };
    group.ids.push(entry.partyId);
    groups.set(key, group);
  }
  return [...groups.values()];
};

export function usePartyBulkTag(
  ids: readonly string[],
  onDone: () => void
): UsePartyBulkTagResult {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const tags = useAppSelector(selectPartyTags);
  const tagsById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag.name] as const)),
    [tags]
  );

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  const [result, setResult] = useState<BulkTagResult | null>(null);
  const [applied, setApplied] = useState<{
    readonly mode: BulkTagMode;
    /** One inverse call per distinct set of tags that was actually written. */
    readonly groups: readonly { readonly ids: string[]; readonly names: string[] }[];
  } | null>(null);

  const start = useCallback(() => {
    setResult(null);
    setApplied(null);
    setUndone(false);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setResult(null);
    setApplied(null);
    setUndone(false);
  }, []);

  const confirm = useCallback(
    (tagNames: readonly string[], mode: BulkTagMode) => {
      if (tagNames.length === 0) return;
      setSaving(true);
      void dispatch(bulkTagPartiesThunk({ partyIds: ids, tagNames, mode }))
        .unwrap()
        .then((outcome) => {
          setResult(outcome);
          /* Captured here rather than read from the selection later: the
             refetch this mutation triggers may remove the tagged rows from an
             active filter, and the merchant may change the filter while the
             report is open. Undo has to mean the parties that changed, not
             whatever is selected in ten seconds' time. */
          setApplied({ mode, groups: groupChanges(outcome.changed, tagsById) });
          onDone();
        })
        .catch(() => {
          /* Swallowed on purpose: `toApiError` already routed this to the global
             snackbar, and the dialog stays open on its form so the merchant can
             press again without retyping. Rethrowing here would be an unhandled
             rejection for an error that has already been reported. */
        })
        .finally(() => setSaving(false));
    },
    [dispatch, ids, onDone, tagsById]
  );

  const undo = useCallback(() => {
    if (applied === null || applied.mode === 'replace' || applied.groups.length === 0) return;
    setUndoing(true);
    /* One call per distinct tag set. In practice that is one — every party in a
       bulk add usually gains the same tags — and it is more only when some
       parties already had some of them, which is precisely the case the naive
       inverse got wrong. */
    const inverse: BulkTagMode = applied.mode === 'add' ? 'remove' : 'add';
    void Promise.all(
      applied.groups.map((group) =>
        dispatch(
          bulkTagPartiesThunk({ partyIds: group.ids, tagNames: group.names, mode: inverse })
        ).unwrap()
      )
    )
      .then(() => {
        setUndone(true);
        dispatch(showSnackbar({ severity: 'success', id: 'parties.tags.bulk.undone' }));
      })
      .catch(() => {
        /* Already toasted. The Undo button stays enabled so it can be retried;
           both directions are idempotent, so a retry after a partial failure
           finishes the job rather than doubling it. */
      })
      .finally(() => setUndoing(false));
  }, [applied, dispatch]);

  return useMemo(
    () => ({
      canTag: can('parties.party.write'),
      open,
      saving,
      undoing,
      undone,
      result,
      appliedMode: applied?.mode ?? null,
      start,
      close,
      confirm,
      undo,
    }),
    [can, open, saving, undoing, undone, result, applied, start, close, confirm, undo]
  );
}
