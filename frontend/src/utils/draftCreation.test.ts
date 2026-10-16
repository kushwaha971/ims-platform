import { draftReplyOutcome, draftSnapshot } from './draftCreation';

/**
 * ADR-063 — the one decision every autosaving editor makes on a save reply.
 * Sales and purchases both read it, so a wrong branch here would duplicate a
 * draft, overwrite another device's edits, or post a document twice in both.
 */
describe('draftReplyOutcome', () => {
  it.each([
    [{ recovered: false, isDraft: true, version: 1 }, 'saved'],
    [{ recovered: false, isDraft: true, version: 7 }, 'saved'],
    [{ recovered: true, isDraft: true, version: 1 }, 'adopt'],
    [{ recovered: true, isDraft: true, version: 2 }, 'conflict'],
    [{ recovered: true, isDraft: false, version: 1 }, 'posted'],
    [{ recovered: false, isDraft: false, version: 4 }, 'posted'],
  ] as const)('%j → %s', (reply, outcome) => {
    expect(draftReplyOutcome(reply)).toBe(outcome);
  });
});

it('does not count minting the creation key as typing during a save', () => {
  expect(draftSnapshot({ notes: 'a' })).toBe(draftSnapshot({ notes: 'a', clientDraftKey: 'k1' }));
  expect(draftSnapshot({ notes: 'a' })).not.toBe(draftSnapshot({ notes: 'b' }));
});
