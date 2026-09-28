'use client';

import { useCallback, useMemo, useState } from 'react';

import { useAppDispatch } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';

import { countTagParties } from '../api/tagService';
import {
  createPartyTag,
  deletePartyTag,
  mergePartyTags,
  updatePartyTag,
} from '../redux/partyTagThunk';

import type { PartyTagWithCount } from '../types/party.types';

/** Which overlay the manager has open. One at a time, by construction. */
export type TagManagerStage = 'closed' | 'form' | 'merge' | 'delete';

export interface TagFormDraft {
  readonly id: string | null;
  readonly name: string;
  readonly color: string | null;
}

export interface UsePartyTagManagerResult {
  readonly canWrite: boolean;
  readonly canDelete: boolean;
  readonly stage: TagManagerStage;
  readonly draft: TagFormDraft | null;
  readonly target: PartyTagWithCount | null;
  readonly saving: boolean;
  readonly error: ApiErrorShape | null;
  /** Set when a rename collided; carries the id of the tag to merge into. */
  readonly collision: { readonly name: string; readonly id: string } | null;
  /** The server's own count for the delete dialog; null while it is in flight. */
  readonly deleteCount: number | null;
  readonly openCreate: () => void;
  readonly openEdit: (tag: PartyTagWithCount) => void;
  readonly openMerge: (tag: PartyTagWithCount) => void;
  readonly openDelete: (tag: PartyTagWithCount) => void;
  readonly close: () => void;
  readonly save: (draft: TagFormDraft) => void;
  readonly merge: (intoId: string) => void;
  readonly remove: () => void;
  /** Turns the rename collision into the merge it is offering. */
  readonly acceptMerge: () => void;
}

/**
 * PTY-05 FR-7 — everything the tag manager can do to a tag.
 *
 * ── The delete count is fetched, not read from the row ──────────────────────
 * The manager's list carries `party_count`, so the dialog could just use it.
 * It must not: that number is from whenever the list was last loaded, and the
 * sentence it goes into — "it will be taken off 34 parties" — is a statement
 * about what is ABOUT TO HAPPEN. Somebody in the next room tagging parties
 * while this dialog is open is not a hypothetical in a shared book, and a
 * confirmation that quotes a stale number is a confirmation the merchant was
 * right to trust and should not have. So the dialog asks the server, with
 * `?dry_run=true`, which is the same code path the delete itself will take.
 *
 * ── A rename collision becomes an offer, not an error ───────────────────────
 * Renaming "Camp aera" to "Camp Area" when that exists answers 409 with the
 * other tag's id. The merchant has just discovered the two are the same thing,
 * and the useful next move is the merge — so the form does not simply report a
 * refusal, it offers to finish the job. That is the whole reason the server
 * bothers to send `details.existing_tag_id`.
 */
export function usePartyTagManager(): UsePartyTagManagerResult {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();

  const [stage, setStage] = useState<TagManagerStage>('closed');
  const [draft, setDraft] = useState<TagFormDraft | null>(null);
  const [target, setTarget] = useState<PartyTagWithCount | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiErrorShape | null>(null);
  const [collision, setCollision] = useState<{ name: string; id: string } | null>(null);
  const [deleteCount, setDeleteCount] = useState<number | null>(null);

  const close = useCallback(() => {
    setStage('closed');
    setError(null);
    setCollision(null);
    setDeleteCount(null);
  }, []);

  const openCreate = useCallback(() => {
    setDraft({ id: null, name: '', color: null });
    setTarget(null);
    setError(null);
    setCollision(null);
    setStage('form');
  }, []);

  const openEdit = useCallback((tag: PartyTagWithCount) => {
    setDraft({ id: tag.id, name: tag.name, color: tag.color });
    setTarget(tag);
    setError(null);
    setCollision(null);
    setStage('form');
  }, []);

  const openMerge = useCallback((tag: PartyTagWithCount) => {
    setTarget(tag);
    setError(null);
    setStage('merge');
  }, []);

  const openDelete = useCallback((tag: PartyTagWithCount) => {
    setTarget(tag);
    setError(null);
    /* Null until the server answers, so the dialog can say "checking" rather
       than showing a number it has not verified. */
    setDeleteCount(null);
    setStage('delete');
    void countTagParties(tag.id)
      .then(setDeleteCount)
      .catch(() => {
        /* Already toasted by the interceptor. The dialog falls back to the
           cached count with its own wording, which is the honest degradation:
           a number that may be a minute old, rather than no dialog at all. */
        setDeleteCount(tag.partyCount);
      });
  }, []);

  const save = useCallback(
    (next: TagFormDraft) => {
      setSaving(true);
      setError(null);
      setCollision(null);
      const action =
        next.id === null
          ? dispatch(createPartyTag({ name: next.name, color: next.color }))
          : dispatch(updatePartyTag({ id: next.id, name: next.name, color: next.color }));

      void action
        .unwrap()
        .then((result) => {
          if (next.id === null && 'created' in result) {
            /* 200 rather than 201 means the name was already taken and the
               server handed back the tag that has it. Not an error — FR-3 is
               explicit that an idempotent create is a convenience — but the
               merchant asked for a NEW tag and got an existing one, and saying
               so is the difference between "it worked" and "it worked, and here
               is what actually happened". */
            dispatch(
              showSnackbar(
                result.created
                  ? { severity: 'success', id: 'parties.tags.form.created' }
                  : {
                      severity: 'info',
                      id: 'parties.tags.form.existed',
                      params: { name: result.tag.name },
                    }
              )
            );
          } else {
            dispatch(showSnackbar({ severity: 'success', id: 'parties.tags.form.updated' }));
          }
          close();
        })
        .catch((rejected: ApiErrorShape) => {
          const existing = rejected.details?.existing_tag_id;
          if (rejected.code === 'tag_name_taken' && typeof existing === 'string') {
            setCollision({ name: next.name, id: existing });
            return;
          }
          setError(rejected);
        })
        .finally(() => setSaving(false));
    },
    [close, dispatch]
  );

  const merge = useCallback(
    (intoId: string) => {
      if (target === null) return;
      setSaving(true);
      setError(null);
      void dispatch(mergePartyTags({ id: target.id, intoId }))
        .unwrap()
        .then((result) => {
          dispatch(
            showSnackbar({
              severity: 'success',
              id:
                result.skippedDuplicates > 0
                  ? 'parties.tags.merge.doneWithSkips'
                  : 'parties.tags.merge.done',
              params: {
                moved: result.moved,
                target: result.tag.name,
                skipped: result.skippedDuplicates,
              },
            })
          );
          close();
        })
        .catch((rejected: ApiErrorShape) => setError(rejected))
        .finally(() => setSaving(false));
    },
    [close, dispatch, target]
  );

  const acceptMerge = useCallback(() => {
    if (collision === null || target === null) return;
    merge(collision.id);
  }, [collision, merge, target]);

  const remove = useCallback(() => {
    if (target === null) return;
    setSaving(true);
    setError(null);
    void dispatch(deletePartyTag({ id: target.id }))
      .unwrap()
      .then(() => {
        dispatch(showSnackbar({ severity: 'success', id: 'parties.tags.delete.done' }));
        close();
      })
      .catch((rejected: ApiErrorShape) => setError(rejected))
      .finally(() => setSaving(false));
  }, [close, dispatch, target]);

  return useMemo(
    () => ({
      canWrite: can('parties.party.write'),
      /* §12 — deleting a tag changes what every other user in the business
         sees, so it is the party DELETE right rather than the write right a
         staff member has for assigning one at the counter. */
      canDelete: can('parties.party.delete'),
      stage,
      draft,
      target,
      saving,
      error,
      collision,
      deleteCount,
      openCreate,
      openEdit,
      openMerge,
      openDelete,
      close,
      save,
      merge,
      remove,
      acceptMerge,
    }),
    [
      can, stage, draft, target, saving, error, collision, deleteCount,
      openCreate, openEdit, openMerge, openDelete, close, save, merge, remove, acceptMerge,
    ]
  );
}
