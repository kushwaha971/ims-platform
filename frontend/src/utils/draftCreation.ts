import type { FieldValues, UseFormReturn } from 'react-hook-form';

/**
 * ADR-063 / SH-011 — the client half of durable draft creation, shared by
 * every autosaving document editor (sales today; purchases too).
 *
 * The server answers a retried first create with the document as it is NOW
 * and `meta.draft_recovered`. What the editor does next depends only on that
 * flag, whether the document is still a draft and its version — never on the
 * domain — so the decision lives here once and each editor adapts its own
 * envelope to `DraftReply`.
 */

export interface DraftReply {
  readonly recovered: boolean;
  /** Still a draft (not issued, recorded, sent or confirmed). */
  readonly isDraft: boolean;
  readonly version: number;
}

/**
 * - `saved`: an ordinary create or update; accept it.
 * - `adopt`: the original draft, untouched since its create — PATCH the current
 *   typing against version 1, so a concurrent edit still conflicts.
 * - `conflict`: someone edited the recovered draft since; review before overwriting.
 * - `posted`: it was already issued/recorded; lock the editor, never post it again.
 */
export type DraftReplyOutcome = 'saved' | 'adopt' | 'conflict' | 'posted';

export const draftReplyOutcome = ({
  recovered,
  isDraft,
  version,
}: DraftReply): DraftReplyOutcome =>
  !isDraft ? 'posted' : !recovered ? 'saved' : version === 1 ? 'adopt' : 'conflict';

/**
 * What a save SUBMITTED, for comparing with the form when the reply lands. The
 * creation key is identity, not typing: minting it during the save must not
 * read as an edit made while the save was running.
 */
export const draftSnapshot = (values: object): string =>
  JSON.stringify({ ...values, clientDraftKey: undefined });

/**
 * After an autosave reply: only the SUBMITTED values are saved, so the dirty
 * flag is cleared only when the form still equals them. Returns true when newer
 * typing remains and the autosave must run again — its own debounce may have
 * expired while the earlier request was running.
 */
export const settleAutosave = <TForm extends FieldValues>(
  form: UseFormReturn<TForm>,
  submitted: string
): boolean => {
  if (submitted !== draftSnapshot(form.getValues())) return true;
  form.reset(form.getValues(), { keepValues: true });
  return false;
};
