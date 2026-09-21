import { requiresIdempotency } from 'src/api/APIPaths';
import { api } from 'src/api/AxiosInstances';

import { createInvitation, listInvitations, revokeInvitation } from './invitationService';

/**
 * The wire half of PLT-05. The transport is stubbed at the module boundary
 * (§19.13.3, no MSW) and the fixture bodies are the agreed contract verbatim,
 * so a change on either side breaks this test and the backend's together.
 */
describe('invitationService.listInvitations', () => {
  afterEach(() => jest.restoreAllMocks());

  const envelope = (rows: readonly unknown[], meta?: unknown) => ({
    data: { data: rows, ...(meta ? { meta } : {}) },
  });

  it('calls GET /invitations with page pagination', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue(envelope([]));

    await listInvitations({ page: 2, pageSize: 25 });

    const url = get.mock.calls[0]?.[0] as string;
    expect(url).toContain('/invitations?');
    expect(url).toContain('page=2');
    expect(url).toContain('page_size=25');
  });

  it('maps the snake_case row onto the domain shape', async () => {
    jest.spyOn(api, 'get').mockResolvedValue(
      envelope(
        [
          {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'sunita@example.com',
            role: 'staff',
            status: 'pending',
            expires_at: '2026-09-28T10:00:00Z',
            created_at: '2026-09-21T10:00:00Z',
            invited_by: { id: 'u1', name: 'Ramesh' },
          },
        ],
        { page: 1, page_size: 25, total: 1, total_pages: 1 }
      )
    );

    const result = await listInvitations({ page: 1, pageSize: 25 });

    expect(result.rows[0]).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'sunita@example.com',
      role: 'staff',
      status: 'pending',
      expiresAt: '2026-09-28T10:00:00Z',
      createdAt: '2026-09-21T10:00:00Z',
      invitedBy: 'Ramesh',
    });
    expect(result.meta).toEqual({ page: 1, pageSize: 25, total: 1, totalPages: 1 });
  });

  /**
   * The contract writes the list's `meta` as `{...}` and does not fix its keys.
   * A screen that rendered nothing because one counter was absent would be a
   * worse failure than a pagination bar that says "page 1 of 1", so the absence
   * is modelled rather than assumed away.
   */
  it('survives a response with no meta at all', async () => {
    jest.spyOn(api, 'get').mockResolvedValue(
      envelope([
        {
          id: 'a',
          email: 'a@example.com',
          role: 'admin',
          status: 'pending',
          expires_at: '2026-09-28T10:00:00Z',
          created_at: '2026-09-21T10:00:00Z',
        },
      ])
    );

    const result = await listInvitations({ page: 1, pageSize: 25 });

    expect(result.meta).toEqual({ page: 1, pageSize: 25, total: 1, totalPages: 1 });
    // `invited_by` is optional on the wire and a missing one is not a defect.
    expect(result.rows[0]?.invitedBy).toBeNull();
  });

  /** A bare id in a column headed "Invited by" is noise; the column may be empty. */
  it('reads a string invited_by and refuses to show an empty one', async () => {
    jest.spyOn(api, 'get').mockResolvedValue(
      envelope([
        {
          id: 'a',
          email: 'a@example.com',
          role: 'admin',
          status: 'pending',
          expires_at: '2026-09-28T10:00:00Z',
          created_at: '2026-09-21T10:00:00Z',
          invited_by: '   ',
        },
      ])
    );

    const result = await listInvitations({ page: 1, pageSize: 25 });
    expect(result.rows[0]?.invitedBy).toBeNull();
  });
});

describe('invitationService.createInvitation', () => {
  afterEach(() => jest.restoreAllMocks());

  const created = {
    data: {
      data: {
        id: 'i1',
        email: 'nita@example.com',
        role: 'staff',
        status: 'pending',
        expires_at: '2026-09-28T10:00:00Z',
        created_at: '2026-09-21T10:00:00Z',
        accept_url: 'https://app.example.com/invite/abc123',
      },
    },
  };

  /**
   * Canon §0.11 rule 5. Each 201 mints a token, so a retry that carried a fresh
   * key would leave two live ways into the business for one seat — which is a
   * sharper failure than the duplicate row the header usually guards against.
   */
  it('sends the caller’s Idempotency-Key', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue(created);

    await createInvitation({ email: 'nita@example.com', role: 'staff' }, 'key-1');

    const [url, body, config] = post.mock.calls[0] as [string, unknown, { headers?: unknown }];
    expect(url).toBe('/invitations');
    expect(body).toEqual({ email: 'nita@example.com', role: 'staff' });
    expect(config.headers).toEqual({ 'Idempotency-Key': 'key-1' });
  });

  /** And the transport's own backstop agrees this path needs one. */
  it('is on the mandatory-idempotency list', () => {
    expect(requiresIdempotency('/invitations')).toBe(true);
  });

  it('returns the one-time accept_url alongside the invitation', async () => {
    jest.spyOn(api, 'post').mockResolvedValue(created);

    const result = await createInvitation({ email: 'nita@example.com', role: 'staff' }, 'key-1');

    expect(result.acceptUrl).toBe('https://app.example.com/invite/abc123');
    expect(result.email).toBe('nita@example.com');
  });

  /**
   * A 201 with no link is not a failure — the invitation exists and the email
   * has gone — so it must not throw. The dialog says which of the two happened.
   */
  it('reads a missing accept_url as null rather than undefined', async () => {
    jest.spyOn(api, 'post').mockResolvedValue({
      data: { data: { ...created.data.data, accept_url: undefined } },
    });

    const result = await createInvitation({ email: 'nita@example.com', role: 'staff' }, 'key-1');
    expect(result.acceptUrl).toBeNull();
  });

  /** `mobile` is a notification channel; an empty one is not sent at all. */
  it('omits mobile when there is none', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue(created);

    await createInvitation({ email: 'nita@example.com', role: 'staff', mobile: null }, 'key-1');

    expect(post.mock.calls[0]?.[1]).toEqual({ email: 'nita@example.com', role: 'staff' });
  });
});

describe('invitationService.revokeInvitation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls DELETE /invitations/{id}', async () => {
    const del = jest.spyOn(api, 'delete').mockResolvedValue({ status: 204 });

    await revokeInvitation('i1');

    expect(del).toHaveBeenCalledWith('/invitations/i1');
  });
});
