import { api } from 'src/api/AxiosInstances';

import { leaveMembership, setDefaultMembership } from './tenantSwitcherService';

/** PLT-04's two membership writes, against Part 22 §22.3's paths. */
describe('tenantSwitcherService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('patches the membership by id and sends only `is_default: true` (§10)', async () => {
    const patch = jest.spyOn(api, 'patch').mockResolvedValue({ data: {} });

    await setDefaultMembership('m1');

    expect(patch.mock.calls[0]?.[0]).toBe('/memberships/m1');
    // Only `true` is ever sent: "not the default" is not a state a user sets.
    expect(patch.mock.calls[0]?.[1]).toEqual({ is_default: true });
  });

  it('deletes the caller\'s own membership row to leave (FR-7)', async () => {
    const del = jest.spyOn(api, 'delete').mockResolvedValue({ data: {} });

    await leaveMembership('m1');

    expect(del.mock.calls[0]?.[0]).toBe('/memberships/m1');
  });

  it('suppresses the global toast — 409 last_owner needs guidance, not a strip', async () => {
    const del = jest.spyOn(api, 'delete').mockResolvedValue({ data: {} });

    await leaveMembership('m1');

    const config = del.mock.calls[0]?.[1] as { suppressErrorSnackbar?: boolean } | undefined;
    expect(config?.suppressErrorSnackbar).toBe(true);
  });
});
