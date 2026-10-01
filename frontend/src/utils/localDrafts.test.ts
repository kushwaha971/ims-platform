import {
  isLocalNewer,
  listLocalDrafts,
  localDraftKey,
  readLocalDraft,
  removeLocalDraft,
  writeLocalDraft,
} from './localDrafts';

/** T-SAL06-1 — protects the "never lose a half-typed bill" store: write, read, purge, list. */
describe('localDrafts', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips a draft under the tenant/kind namespace', () => {
    const key = localDraftKey('t1', 'invoice', 'abc');
    // Read on the day it was written: with the real clock this test began failing on 1 Oct 2026,
    // a week after its fixed write date, because a seven-day-old draft is (rightly) purged.
    const writtenAt = new Date('2026-09-24T10:00:00Z');
    writeLocalDraft(key, { lines: 2 }, 3, writtenAt);
    expect(window.localStorage.getItem('ub.sales.draft.t1.invoice.abc')).not.toBeNull();
    expect(readLocalDraft<{ lines: number }>(key, writtenAt)?.form.lines).toBe(2);
    removeLocalDraft(key);
    expect(readLocalDraft(key)).toBeNull();
  });

  it('purges entries older than seven days on read', () => {
    const key = localDraftKey('t1', 'invoice', 'old');
    writeLocalDraft(key, {}, null, new Date('2026-09-01T00:00:00Z'));
    expect(readLocalDraft(key, new Date('2026-09-24T00:00:00Z'))).toBeNull();
    expect(window.localStorage.getItem('ub.sales.draft.t1.invoice.old')).toBeNull();
  });

  it('lists only this tenant and kind', () => {
    writeLocalDraft(localDraftKey('t1', 'invoice', 'a'), {}, null);
    writeLocalDraft(localDraftKey('t2', 'invoice', 'b'), {}, null);
    writeLocalDraft(localDraftKey('t1', 'estimate', 'c'), {}, null);
    expect(listLocalDrafts('t1', 'invoice').map((d) => d.draftId)).toEqual(['a']);
  });

  it('offers a restore only when the local copy is newer than the server', () => {
    const local = { savedAt: '2026-09-24T10:00:00Z', version: 1, form: {} };
    expect(isLocalNewer(local, '2026-09-24T09:00:00Z')).toBe(true);
    expect(isLocalNewer(local, '2026-09-24T11:00:00Z')).toBe(false);
    expect(isLocalNewer(null, null)).toBe(false);
  });
});
