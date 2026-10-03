/**
 * F01 — wire (snake_case) ↔ view (camelCase) for every library payload, in one
 * place (FRD library §7, "mapping in `api/libraryMapping.ts`"). The services
 * call these; components never see a wire shape.
 *
 * Starts with the one conversion every library list needs — the filters a
 * list sends as query parameters — and grows with each F-task's payloads.
 */
import type { LibraryListFilters } from '../types/library.types';

/** `{ dueBefore: '2026-10-01', q: '' }` → `{ due_before: '2026-10-01' }` (blanks dropped). */
export const toLibraryQuery = (filters: LibraryListFilters): Record<string, string> =>
  Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value.trim() !== '')
      .map(([key, value]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), value.trim()])
  );
