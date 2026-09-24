import { listLocalKeys, readLocal, removeLocal, writeLocal } from './storage';

/**
 * SAL-06 FR-1 — the editor's form, kept on THIS device while the merchant
 * types, under `ub.sales.draft.<tenantId>.<kind>.<localDraftId>`.
 *
 * `localDraftId` is the server id once the draft has one, or a client id
 * before its first save. Entries older than seven days are purged on read.
 * The draft namespace deliberately survives logout and tenant switch
 * (`storage.clearLocalExceptDrafts`): the keys are per tenant, so another
 * tenant never sees them, and a phone that logged out mid-bill keeps the bill.
 */

export const LOCAL_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface LocalDraft<TForm> {
  readonly savedAt: string;
  readonly version: number | null;
  readonly form: TForm;
}

const prefixFor = (tenantId: string, kind: string): string => `sales.draft.${tenantId}.${kind}.`;

export const localDraftKey = (tenantId: string, kind: string, draftId: string): string =>
  `${prefixFor(tenantId, kind)}${draftId}`;

export const writeLocalDraft = <TForm>(
  key: string,
  form: TForm,
  version: number | null,
  now: Date = new Date()
): void => {
  writeLocal(key, { savedAt: now.toISOString(), version, form } satisfies LocalDraft<TForm>);
};

export const readLocalDraft = <TForm>(
  key: string,
  now: Date = new Date()
): LocalDraft<TForm> | null => {
  const draft = readLocal<LocalDraft<TForm> | null>(key, null);
  if (!draft || typeof draft.savedAt !== 'string') return null;
  if (now.getTime() - new Date(draft.savedAt).getTime() > LOCAL_DRAFT_MAX_AGE_MS) {
    removeLocal(key);
    return null;
  }
  return draft;
};

export const removeLocalDraft = (key: string): void => removeLocal(key);

/** FR-4 — every unsynced local draft of a kind for this tenant (purging the stale). */
export const listLocalDrafts = <TForm>(
  tenantId: string,
  kind: string,
  now: Date = new Date()
): { readonly key: string; readonly draftId: string; readonly draft: LocalDraft<TForm> }[] => {
  const prefix = prefixFor(tenantId, kind);
  return listLocalKeys(prefix).flatMap((key) => {
    const draft = readLocalDraft<TForm>(key, now);
    return draft ? [{ key, draftId: key.slice(prefix.length), draft }] : [];
  });
};

/** FR-3 — a local copy is worth offering only when it is newer than the server's. */
export const isLocalNewer = (
  local: LocalDraft<unknown> | null,
  serverUpdatedAt: string | null
): boolean => !!local && (!serverUpdatedAt || new Date(local.savedAt) > new Date(serverUpdatedAt));
