import { configureStore, type UnknownAction } from '@reduxjs/toolkit';

import { cacheInvalidated, invalidationListener } from './listener';
import { INVALIDATION } from './map';
import {
  moduleEntriesFor,
  moduleThunks,
  registeredInvalidationModules,
  registerInvalidation,
  resetModuleInvalidationForTests,
} from './moduleRegistry';
import { MUTATIONS } from './registry';

import type { TSliceKey } from './types';

/**
 * ADR-062 — the module invalidation registry and the listener's union. Each
 * case names the defect it prevents. A planted module (`planted`) stands in
 * for the library until F02 writes its first thunk, so none of this is vacuous.
 */
const slice = (key: string): TSliceKey => key as TSliceKey;

const planted = (
  map: Record<'savePlanted', object> = { savePlanted: { stale: [slice('partyList')] } }
) =>
  registerInvalidation({
    module: 'planted',
    queries: { fetchPlanted: 'planted/fetch' },
    mutations: { savePlanted: 'planted/save' },
    map,
    ownSlices: [slice('plantedList')],
  });

const signals = (type: string): { slices: readonly TSliceKey[]; urgency: string }[] => {
  const seen: { slices: readonly TSliceKey[]; urgency: string }[] = [];
  const store = configureStore({
    reducer: (state: null = null, action: UnknownAction) => {
      if (cacheInvalidated.match(action)) seen.push(action.payload);
      return state;
    },
    middleware: (getDefault) => getDefault().prepend(invalidationListener.middleware),
  });
  store.dispatch({ type });
  return seen;
};

afterEach(() => resetModuleInvalidationForTests());

describe('registerInvalidation', () => {
  it('registers by typePrefix, so the listener can find a module mutation', () => {
    planted();
    expect(registeredInvalidationModules()).toEqual(['planted']);
    expect(moduleEntriesFor('planted/save/fulfilled')).toEqual([{ stale: ['partyList'] }]);
    expect(moduleThunks('planted')?.queries).toEqual({ fetchPlanted: 'planted/fetch' });
  });

  it('replaces a module on a second call — a hot reload never doubles an entry', () => {
    planted();
    planted({ savePlanted: { refetch: [slice('partyList')] } });
    expect(moduleEntriesFor('planted/save/fulfilled')).toEqual([{ refetch: ['partyList'] }]);
  });

  it('refuses resetAll, which is core-only (the tenant switch)', () => {
    expect(() => planted({ savePlanted: { resetAll: true } })).toThrow(/core/);
  });

  it("refuses a patch on a slice the module does not own (a core reducer can't learn a module action)", () => {
    expect(() => planted({ savePlanted: { patch: [[slice('partyDetail'), 'balance']] } })).toThrow(
      /does not own/
    );
    expect(() =>
      planted({ savePlanted: { patch: [[slice('plantedList'), 'rows']] } })
    ).not.toThrow();
  });

  it('refuses an entry for a mutation the module never registered', () => {
    expect(() =>
      registerInvalidation({
        module: 'planted',
        queries: {},
        mutations: {},
        map: { ghost: { stale: [slice('partyList')] } } as Record<never, object>,
      })
    ).toThrow(/names no registered thunk/);
  });
});

describe('the listener applies core and module entries as one union', () => {
  it('signals a module-only mutation (the action core has never heard of)', () => {
    planted();
    expect(signals('planted/save/fulfilled')).toEqual([
      { slices: ['partyList'], urgency: 'next-mount' },
    ]);
  });

  it("signals each slice once, with 'now' winning, when a module adds to a core mutation", () => {
    const found = (Object.keys(MUTATIONS) as (keyof typeof MUTATIONS)[]).find(
      (name) => !INVALIDATION[name].resetAll && (INVALIDATION[name].stale?.length ?? 0) > 0
    );
    if (!found) throw new Error('core has no stale-only mutation to add to');
    const coreStale = INVALIDATION[found].stale?.[0] as TSliceKey;
    // The module asks for the SAME slice core stales, but now.
    registerInvalidation({
      module: 'planted',
      queries: {},
      mutations: {},
      map: {},
      core: { [found]: { stale: [slice('plantedList')], refetch: [coreStale] } },
      ownSlices: [slice('plantedList')],
    });
    const seen = signals(`${MUTATIONS[found]}/fulfilled`);
    const now = seen.filter((s) => s.urgency === 'now').flatMap((s) => s.slices);
    const later = seen.filter((s) => s.urgency === 'next-mount').flatMap((s) => s.slices);
    expect(seen.filter((s) => s.urgency === 'now')).toHaveLength(1);
    expect(now).toContain(coreStale);
    expect(later).toContain('plantedList');
    expect(later).not.toContain(coreStale);
    expect(new Set([...now, ...later]).size).toBe(now.length + later.length);
  });

  it('lets a core resetAll short-circuit every module entry', () => {
    registerInvalidation({
      module: 'planted',
      queries: {},
      mutations: {},
      map: {},
      core: { switchTenant: { stale: [slice('plantedList')] } },
      ownSlices: [slice('plantedList')],
    });
    expect(signals(`${MUTATIONS.switchTenant}/fulfilled`)).toEqual([]);
  });
});
