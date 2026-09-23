// @lint-at: hooks/usePartyAllowedProbe.ts
// @expect: (none)
// The control: what the fence must NOT catch. Reading one party by id, the
// per-party paths, the BulkArchiveResult type, and going through the hook.
import { API_PATHS } from 'src/api/APIPaths';

import { getParty, type BulkArchiveResult } from 'modules/DigiKhaato/features/parties/api/partyService';
import { usePartySearch } from 'modules/DigiKhaato/features/parties/hooks/usePartySearch';

export const probePath = (id: string): string => API_PATHS.PARTY(id);
export const probeRead = (id: string): Promise<unknown> => getParty(id);
export type ProbeResult = BulkArchiveResult;
export const useProbeSearch = (): ReturnType<typeof usePartySearch> => usePartySearch();
