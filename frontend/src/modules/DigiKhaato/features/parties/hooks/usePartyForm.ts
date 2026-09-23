'use client';

import { useCallback, useMemo, useState } from 'react';


import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import { PARTY_FIELDS, SERVER_FIELD_TO_FORM } from '../constants/partyFormFields';
import {
  partyCreateOpened,
  partyEditOpened,
  partyFormClosed,
  partyWarningsDismissed,
  selectPartyFormEditing,
  selectPartyFormOpenFor,
  selectPartyFormPrefillName,
  selectPartyFormStatus,
  selectPartyFormWarnings,
  selectPartyFormLastSaved,
} from '../redux/partyFormSlice';
import { saveParty } from '../redux/partyFormThunk';

import type { PartyDetail, PartyFormValues, PartyWarning } from '../types/party.types';
import type { UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.4 — everything the drawer does, so the drawer only renders.
 *
 * ── The duplicate-mobile hand-off ───────────────────────────────────────────
 * The server refuses a duplicate with a 400 whose details carry the existing
 * party's ID and status and DELIBERATELY NOT its name — that is another
 * record's data, returned to somebody who asked about neither. So the form
 * cannot say "this belongs to Ramesh Traders"; it says the number is taken and
 * offers to open the party that has it, and the ordinary retrieve decides
 * whether the name may be shown. `duplicateOf` is what carries that id out to
 * the component.
 */
export interface UsePartyFormResult {
  readonly open: boolean;
  readonly isEdit: boolean;
  /** The name a create was opened WITH, or `''`. Empty on every edit. */
  readonly prefillName: string;
  readonly editing: PartyDetail | null;
  readonly isSaving: boolean;
  readonly canWrite: boolean;
  readonly formErrors: readonly string[];
  /** The id of the party already holding the mobile that was just refused. */
  readonly duplicateOf: string | null;
  readonly warnings: readonly PartyWarning[];
  readonly lastSaved: PartyDetail | null;
  /** `name` starts the form with that name filled in — see `partyCreateOpened`. */
  readonly openCreate: (name?: string) => void;
  readonly openEdit: (party: PartyDetail) => void;
  readonly close: () => void;
  readonly dismissWarnings: () => void;
  readonly submit: (
    values: PartyFormValues,
    setError: UseFormSetError<PartyFormValues>
  ) => Promise<void>;
}

export const usePartyForm = (): UsePartyFormResult => {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const { canWrite: canWriteIn } = useDegradedNetwork();

  const openFor = useAppSelector(selectPartyFormOpenFor);
  const prefillName = useAppSelector(selectPartyFormPrefillName);
  const editing = useAppSelector(selectPartyFormEditing);
  const status = useAppSelector(selectPartyFormStatus);
  const warnings = useAppSelector(selectPartyFormWarnings);
  const lastSaved = useAppSelector(selectPartyFormLastSaved);

  const { key, rotate } = useIdempotencyKey();
  const [formErrors, setFormErrors] = useState<readonly string[]>([]);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);

  /**
   * Class **B, deferred** (§19.10.4), not class A.
   *
   * A party create is queueable in principle — the idempotency key and the
   * partial unique index between them make a replay safe. What is not safe is
   * the DUPLICATE CHECK: the server is the only thing that knows what else is
   * in the book, so a party queued offline can be accepted locally and refused
   * hours later, on a screen the merchant has long since left, after they have
   * already started writing entries against a customer that does not exist.
   *
   * Class B is the honest position: not attempted while offline, and the
   * outbox promotes it in Phase 2 when there is somewhere sensible to report
   * the refusal.
   */
  const canWrite = can('parties.party.write') && canWriteIn('deferred');

  const openCreate = useCallback(
    (name?: string) => {
      setFormErrors([]);
      setDuplicateOf(null);
      dispatch(partyCreateOpened(name));
    },
    [dispatch]
  );

  const openEdit = useCallback(
    (party: PartyDetail) => {
      setFormErrors([]);
      setDuplicateOf(null);
      dispatch(partyEditOpened(party));
    },
    [dispatch]
  );

  const close = useCallback(() => {
    setFormErrors([]);
    setDuplicateOf(null);
    dispatch(partyFormClosed());
  }, [dispatch]);

  const dismissWarnings = useCallback(() => {
    dispatch(partyWarningsDismissed());
  }, [dispatch]);

  const submit = useCallback(
    async (values: PartyFormValues, setError: UseFormSetError<PartyFormValues>) => {
      setFormErrors([]);
      setDuplicateOf(null);
      try {
        const saved = await dispatch(
          saveParty({
            values,
            partyId: openFor && openFor !== 'new' ? openFor : undefined,
            idempotencyKey: key,
          })
        ).unwrap();
        // A new key for the next logical save. Reusing one the server has
        // already answered would replay the party just created rather than
        // creating the next one.
        rotate();

        /**
         * The drawer has closed by now, so the confirmation has to live
         * outside it. Two things travel: that it saved, and — when the server
         * sent one — the GSTIN/state note, which is the whole reason that
         * warning channel exists. A warning that reaches the store and nothing
         * else is a warning nobody was told.
         */
        const mismatch = saved.warnings.find((w) => w.code === 'gstin_state_mismatch');
        dispatch(
          showSnackbar(
            mismatch
              ? {
                  severity: 'warning',
                  id: 'parties.form.warning.gstinState',
                  params: {
                    gstinState: mismatch.gstinStateCode ?? '',
                    state: mismatch.stateCode ?? '',
                  },
                }
              : { severity: 'success', id: 'parties.form.saved', params: { name: saved.party.name } }
          )
        );
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          // A corrected field is a NEW logical write: the server has seen this
          // key with the old body and would answer 409 rather than accept the
          // correction.
          rotate();

          const details = apiError.details as Record<string, unknown> | undefined;
          const existing = details?.existing_party_id;
          if (typeof existing === 'string') setDuplicateOf(existing);

          /**
           * `details` carries two kinds of thing and only one of them is a
           * message. `existing_party_id` and `existing_status` are DATA for the
           * client — they are how the duplicate banner knows where to link —
           * and `applyServerErrors` anchors anything it cannot match to a field
           * as a form-level error, so they were being printed: a raw UUID and
           * the word "active", in red, above the name field.
           *
           * Meaningless to a merchant, and an internal id on screen for no
           * reason. They are consumed above and removed here.
           */
          const MESSAGE_KEYS_ONLY = ['existing_party_id', 'existing_status'];
          const translated: ApiErrorShape = {
            ...apiError,
            details: Object.fromEntries(
              Object.entries(details ?? {})
                .filter(([path]) => !MESSAGE_KEYS_ONLY.includes(path))
                // Server paths are snake_case, and a couple are not the form's
                // own names at all — `billing_address` anchors on the line-1
                // field, because that is the box a merchant will look at.
                .map(([path, value]) => [SERVER_FIELD_TO_FORM[path] ?? path, value])
            ),
          };
          setFormErrors(applyServerErrors(translated, setError, [...PARTY_FIELDS]));
          return;
        }
        if (apiError.code === 'party_archived') {
          // Not a field error: the request was well formed and the record's
          // state said no. It belongs at form level, where the merchant can
          // read it beside a Restore they will need.
          setFormErrors([apiError.message]);
          return;
        }
        // Anything else has already surfaced through the global snackbar.
        dispatch(showSnackbar({ severity: 'error', id: 'parties.form.error.title' }));
      }
    },
    [dispatch, key, openFor, rotate]
  );

  return useMemo(
    () => ({
      open: openFor !== null,
      prefillName,
      isEdit: openFor !== null && openFor !== 'new',
      editing,
      isSaving: status === 'loading',
      canWrite,
      formErrors,
      duplicateOf,
      warnings,
      lastSaved,
      openCreate,
      openEdit,
      close,
      dismissWarnings,
      submit,
    }),
    [
      openFor,
      editing,
      prefillName,
      status,
      canWrite,
      formErrors,
      duplicateOf,
      warnings,
      lastSaved,
      openCreate,
      openEdit,
      close,
      dismissWarnings,
      submit,
    ]
  );
};
