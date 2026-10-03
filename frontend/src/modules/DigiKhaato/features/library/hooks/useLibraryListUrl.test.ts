import { seedListPatch, writeListQuery } from 'src/hooks/useListUrl';

import { toLibraryQuery } from '../api/libraryMapping';

import { libraryListCodec } from './useLibraryListUrl';

type Filters = { readonly q: string; readonly status: string };
const codec = libraryListCodec<Filters>({
  keys: ['q', 'status'],
  closed: { status: ['available', 'on_loan'] },
});
const DEFAULTS: Filters = { q: '', status: '' };

/**
 * F01 — the defects: a hand-edited or stale link (`?status=lost`) sent a value
 * nobody chose to the server as a filter; and a URL that does not name an axis
 * kept whatever the slice still held instead of its default (the party list's
 * UAT D7, which the shared mechanism now fixes for every library list too).
 */
describe('library list URLs', () => {
  it('drops a closed axis value outside its vocabulary, and blanks', () => {
    expect(codec.read(new URLSearchParams('status=lost&q=%20'))).toEqual({});
    expect(codec.read(new URLSearchParams('status=on_loan&q= Gita '))).toEqual({
      status: 'on_loan',
      q: 'Gita',
    });
  });

  it('seeds every axis the URL does not name back to its default', () => {
    const current: Filters = { q: 'old', status: 'on_loan' };
    expect(seedListPatch(codec.keys, { q: 'new' }, current, DEFAULTS)).toEqual({
      q: 'new',
      status: '',
    });
  });

  it('writes only what differs from the defaults, in key order', () => {
    expect(writeListQuery(codec.keys, { q: 'Gita', status: 'available' }, DEFAULTS)).toBe(
      'q=Gita&status=available'
    );
    expect(writeListQuery(codec.keys, DEFAULTS, DEFAULTS)).toBe('');
  });

  it('maps camelCase filters to the wire, dropping blanks', () => {
    expect(toLibraryQuery({ dueBefore: '2026-10-01', q: ' ' })).toEqual({
      due_before: '2026-10-01',
    });
  });
});
