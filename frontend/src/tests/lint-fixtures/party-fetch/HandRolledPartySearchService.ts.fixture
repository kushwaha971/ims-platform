// @lint-at: api/probePartySearchService.ts
// @expect: no-restricted-syntax
// A second service hand-rolling `GET /parties?q=` without touching partyService.
import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';

export const searchPartiesProbe = async (q: string): Promise<unknown> => {
  const response = await api.get<unknown>(
    `${API_PATHS.PARTIES}?q=${encodeURIComponent(q)}`,
    ubConfig({})
  );
  return response.data;
};
