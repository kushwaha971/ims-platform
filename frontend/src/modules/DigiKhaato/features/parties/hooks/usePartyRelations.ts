'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { newRequestId } from 'src/utils/requestId';

import {
  relationDialogClosed,
  relationDialogOpened,
  selectPartyRelationError,
  selectPartyRelations,
  selectPartyRelationsFor,
  selectPartyRelationStatus,
  selectRelationDialogOpen,
  selectRelationRemovingId,
  selectRelationSaving,
} from '../redux/partyRelationSlice';
import {
  createPartyRelation,
  deletePartyRelation,
  fetchPartyRelations,
} from '../redux/partyRelationThunk';

import type { PartyRelationDraft, PartyRelations } from '../types/party.types';

/**
 * Part 19 §19.1.1 layer 4 — the only door into Redux for the khata's guardian
 * and payer section (A6). `canWrite` is `parties.party.write` (§10): staff may
 * link and unlink, an accountant only reads.
 */
export interface UsePartyRelationsResult {
  readonly data: PartyRelations | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly canWrite: boolean;
  readonly dialogOpen: boolean;
  readonly saving: boolean;
  readonly saveError: ApiErrorShape | null;
  readonly removingId: string | null;
  readonly openDialog: () => void;
  readonly closeDialog: () => void;
  readonly save: (draft: PartyRelationDraft) => void;
  readonly remove: (relationId: string) => void;
  readonly refetch: () => void;
}

export function usePartyRelations(partyId: string, enabled: boolean): UsePartyRelationsResult {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const forParty = useAppSelector(selectPartyRelationsFor);
  const stored = useAppSelector(selectPartyRelations);
  const status = useAppSelector(selectPartyRelationStatus);
  const error = useAppSelector(selectPartyRelationError);
  const dialogOpen = useAppSelector(selectRelationDialogOpen);
  const saving = useAppSelector(selectRelationSaving);
  const removingId = useAppSelector(selectRelationRemovingId);
  /* One key per OPENING of the dialog, so a retry after a lost response replays
     the link that was made rather than being refused as a duplicate. */
  const [key, setKey] = useState('');
  const [saveError, setSaveError] = useState<ApiErrorShape | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const promise = dispatch(fetchPartyRelations(partyId));
    return () => promise.abort();
  }, [enabled, partyId, dispatch]);

  const openDialog = useCallback(() => {
    setKey(newRequestId());
    setSaveError(null);
    dispatch(relationDialogOpened());
  }, [dispatch]);
  const closeDialog = useCallback(() => dispatch(relationDialogClosed()), [dispatch]);

  const save = useCallback(
    (draft: PartyRelationDraft) => {
      setSaveError(null);
      void dispatch(createPartyRelation({ partyId, draft, idempotencyKey: key }))
        .unwrap()
        .then(() => dispatch(showSnackbar({ severity: 'success', id: 'parties.relations.added' })))
        .catch((rejected: ApiErrorShape) => {
          setSaveError(rejected ?? null);
          // A refusal wrote nothing; the next attempt is a new request.
          setKey(newRequestId());
        });
    },
    [dispatch, partyId, key]
  );

  const remove = useCallback(
    (relationId: string) => {
      void dispatch(deletePartyRelation({ partyId, relationId }))
        .unwrap()
        .then((removal) =>
          dispatch(
            showSnackbar({
              severity: 'success',
              id:
                removal.outcome === 'ended'
                  ? 'parties.relations.endedDone'
                  : 'parties.relations.removed',
            })
          )
        )
        .catch(() => undefined);
    },
    [dispatch, partyId]
  );

  const refetch = useCallback(() => {
    void dispatch(fetchPartyRelations(partyId));
  }, [dispatch, partyId]);

  const data = forParty === partyId ? stored : null;

  return useMemo(
    () => ({
      data,
      status: forParty === partyId ? status : 'idle',
      error: forParty === partyId ? error : null,
      canWrite: can('parties.party.write'),
      dialogOpen,
      saving,
      saveError,
      removingId,
      openDialog,
      closeDialog,
      save,
      remove,
      refetch,
    }),
    [
      data,
      forParty,
      partyId,
      status,
      error,
      can,
      dialogOpen,
      saving,
      saveError,
      removingId,
      openDialog,
      closeDialog,
      save,
      remove,
      refetch,
    ]
  );
}
