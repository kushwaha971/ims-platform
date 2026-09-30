import { toListRow, toOrigin } from '../api/salesMapping';
import { originFilterModules, originHref, type OriginLink } from '../originLinks';

import { invoiceFiltersFromQuery, invoiceQueryFromFilters, isNarrowed } from './invoiceDisplay';
import { originWords } from './originDisplay';

/**
 * A5 (FRD 00 PLT-X05 §7, §8) — the origin a document another module issued carries, from the
 * wire to the badge's words, the badge's link and the list's origin chip.
 */
const LINKS: Readonly<Record<string, OriginLink>> = {
  gym_membership: { module: 'gym', path: (id) => `/gym/memberships/${id}` },
  hospitality_folio: { module: 'hospitality', path: (id) => `/hospitality/folios/${id}` },
  dues_due: { module: 'dues', path: (id) => `/dues/${id}` },
};

describe('the document origin', () => {
  it('maps the wire shape and keeps a counter document at null', () => {
    expect(toOrigin({ module: 'gym', type: 'gym_membership', id: 'm1', label: null })).toEqual({
      module: 'gym',
      type: 'gym_membership',
      id: 'm1',
      label: null,
    });
    expect(toOrigin(null)).toBeNull();
    expect(toListRow({ id: 'd1', origin: null }).origin).toBeNull();
  });

  it("words: the module's name, then the module's own label when it gave one", () => {
    expect(originWords({ module: 'gym', type: 't', id: 'x', label: 'M-0042' })).toEqual({
      id: 'sales.origin.fromWithLabel',
      moduleId: 'sales.origin.module.gym',
      module: 'gym',
      label: 'M-0042',
    });
    // A module code the map does not know yet is shown as the code, not hidden.
    expect(originWords({ module: 'coaching', type: 't', id: 'x', label: null })).toMatchObject({
      id: 'sales.origin.from',
      moduleId: null,
      module: 'coaching',
    });
  });

  it('links only where a module registered a path; the shipped map is empty', () => {
    expect(originHref({ type: 'gym_membership', id: 'm1' }, LINKS)).toBe('/gym/memberships/m1');
    expect(originHref({ type: 'unknown', id: 'm1' }, LINKS)).toBeNull();
    expect(originHref({ type: 'gym_membership', id: 'm1' })).toBeNull();
  });

  it('offers a module as a filter only when it has a link AND is enabled', () => {
    const enabled = (module: string) => module !== 'hospitality';
    expect(originFilterModules(enabled, LINKS)).toEqual(['dues', 'gym']);
    expect(originFilterModules(() => true)).toEqual([]);
  });

  it('round-trips ?origin= through the address bar and counts as narrowing', () => {
    const filters = invoiceFiltersFromQuery(new URLSearchParams('origin=gym'), '2026-10-01');
    expect(filters.originModule).toBe('gym');
    expect(isNarrowed(filters)).toBe(true);
    expect(invoiceQueryFromFilters(filters)).toContain('origin=gym');
    const none = invoiceFiltersFromQuery(new URLSearchParams(''), '2026-10-01');
    expect(none.originModule).toBeNull();
    expect(invoiceQueryFromFilters(none)).not.toContain('origin');
  });
});
