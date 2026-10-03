import type { TInvalidationEntry } from './types';

/**
 * ADR-062 — the half of the module invalidation registry the LISTENER needs,
 * and nothing more: the store imports the listener, so this file ships to every
 * route, `/login` included. Registration — its validation, its messages and
 * its conversion from names to typePrefixes — lives in `moduleRegistry.ts`,
 * which only the modules' own `*Invalidation.ts` files (in their own chunks)
 * import. Keeping that out of the shell is the point of the ADR (F01 measured
 * the shell growing 0.3 KB gz with both halves in one file).
 */
export type TModuleInvalidationEntry = Omit<TInvalidationEntry, 'resetAll'>;

export interface TRegisteredModule {
  readonly queries: Readonly<Record<string, string>>;
  readonly mutations: Readonly<Record<string, string>>;
  /** `${typePrefix}/fulfilled` → entry. */
  readonly byAction: ReadonlyMap<string, TModuleInvalidationEntry>;
}

export const MODULE_INVALIDATION = new Map<string, TRegisteredModule>();

/** Every module entry registered for one action type (empty when none). */
export function moduleEntriesFor(actionType: string): readonly TModuleInvalidationEntry[] {
  const found: TModuleInvalidationEntry[] = [];
  MODULE_INVALIDATION.forEach((registered) => {
    const entry = registered.byAction.get(actionType);
    if (entry) found.push(entry);
  });
  return found;
}
