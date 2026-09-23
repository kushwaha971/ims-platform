import { DEFAULT_PARTY_FILTERS } from '../redux/partyListSlice';

import { writeFilters } from './usePartyListUrl';

import type { PartyListFilters } from '../types/party.types';

const filters = (patch: Partial<PartyListFilters>): PartyListFilters => ({
  ...DEFAULT_PARTY_FILTERS,
  ...patch,
});

/**
 * The half of the URL sync that is pure. The seeding half is asserted on the
 * real screen in `PartyListPageContent.test.tsx`, because what matters there is
 * that a link actually filters the list rather than that a parser parsed.
 */
describe('writeFilters', () => {
  it('writes nothing for an untouched list', () => {
    /**
     * A clean `/parties`, not `/parties?q=&type=&balance=&status=active`.
     * A URL full of empty parameters is a URL nobody can read, which defeats
     * the reason the filters are in it.
     */
    expect(writeFilters(DEFAULT_PARTY_FILTERS, DEFAULT_PARTY_FILTERS)).toBe('');
  });

  it('carries only what the merchant actually chose', () => {
    expect(writeFilters(filters({ tag: 'Camp Area' }), DEFAULT_PARTY_FILTERS)).toBe(
      'tag=Camp+Area'
    );
  });

  it('keeps a tag list as one comma-separated parameter', () => {
    /**
     * FR-6 — the tag group ORs within itself, and it is one parameter because
     * a person has to be able to read it. `tag=A&tag=B` would be the same
     * filter and unreadable, and the server takes the comma form.
     */
    expect(writeFilters(filters({ tag: 'Camp Area,Route 2' }), DEFAULT_PARTY_FILTERS)).toBe(
      'tag=Camp+Area%2CRoute+2'
    );
  });

  it('writes the Archived tab, because it is not the default', () => {
    expect(writeFilters(filters({ status: 'archived' }), DEFAULT_PARTY_FILTERS)).toBe(
      'status=archived'
    );
  });

  it('never writes the page number', () => {
    /**
     * Every filter change resets pagination (§17.0.3), so a URL carrying both a
     * filter and a page is a URL that is wrong the moment somebody opens it.
     */
    expect(writeFilters(filters({ page: 4, tag: 'Camp Area' }), DEFAULT_PARTY_FILTERS)).toBe(
      'tag=Camp+Area'
    );
  });

  it('writes the ordering, which survives a filter change', () => {
    const query = writeFilters(filters({ ordering: 'name' }), DEFAULT_PARTY_FILTERS);
    expect(query).toBe('ordering=name');
  });

  it('writes the axes in a stable order, so one filter set is one URL', () => {
    /**
     * Two merchants who applied the same three filters in different orders
     * should produce the same link — otherwise a cache keyed on the URL misses
     * itself and two identical screens look like two different ones.
     */
    const applied = filters({ balance: 'owes_me', type: 'customer', tag: 'Camp Area' });
    expect(writeFilters(applied, DEFAULT_PARTY_FILTERS)).toBe(
      'type=customer&balance=owes_me&tag=Camp+Area'
    );
  });
});
