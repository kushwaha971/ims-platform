import { api } from 'src/api/AxiosInstances';

import { blockBorrower, listBorrowers, unblockBorrower, updateBorrower } from './lendingService';

/**
 * Owner, 12 Oct 2026 — editing and blocking a borrower, tested on what the
 * service SENDS and how it reads the answer. A screen test passes straight
 * through a body that forgets `version` (two editors silently undoing each
 * other) or a blank mobile sent as '' (a value the party's unique index
 * collides on), so both are asserted here, on the wire.
 */
jest.mock('src/api/AxiosInstances', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  ubConfig: (extras: unknown) => extras,
}));

const mocked = api as jest.Mocked<typeof api>;

const WIRE = {
  id: 'b1',
  number: 'B-0001',
  party_id: 'p1',
  name: 'Geeta Devi',
  mobile: '+919820011223',
  area: 'Camp',
  route: null,
  notes: 'Behind the temple',
  status: 'blocked',
  blocked_at: '2026-10-12T05:00:00Z',
  blocked_reason: 'Paid late twice',
  version: 3,
};

beforeEach(() => jest.clearAllMocks());

describe('borrower writes', () => {
  it('reads status, reason, notes and version off a borrower', async () => {
    mocked.get.mockResolvedValue({ data: { data: [WIRE], meta: {} } });
    const page = await listBorrowers({ q: '' });
    expect(page.rows[0]).toMatchObject({
      status: 'blocked',
      blockedReason: 'Paid late twice',
      notes: 'Behind the temple',
      version: 3,
    });
  });

  it('reads an older server with no status as active', async () => {
    const { status: _gone, ...older } = WIRE;
    mocked.get.mockResolvedValue({ data: { data: [older], meta: {} } });
    const page = await listBorrowers({});
    expect(page.rows[0]?.status).toBe('active');
  });

  it('sends ?status= only for a narrowing choice, never "all"', async () => {
    mocked.get.mockResolvedValue({ data: { data: [], meta: {} } });
    await listBorrowers({ q: '', status: 'all' });
    expect(mocked.get.mock.calls[0]?.[0]).toBe('/lending/borrowers');
    await listBorrowers({ q: 'gee', status: 'blocked' });
    expect(mocked.get.mock.calls[1]?.[0]).toContain('status=blocked');
    expect(mocked.get.mock.calls[1]?.[0]).toContain('q=gee');
  });

  it('PATCHes the edit with its version, and a blank mobile as null', async () => {
    mocked.patch.mockResolvedValue({ data: { data: WIRE } });
    await updateBorrower('b1', { name: ' Geeta ', mobile: '', area: 'Camp', notes: '' }, 3);
    expect(mocked.patch).toHaveBeenCalledWith(
      '/lending/borrowers/b1',
      { version: 3, name: 'Geeta', mobile: null, area: 'Camp', notes: '' },
      expect.anything()
    );
  });

  it('blocks with the reason, or with none when it was left empty', async () => {
    mocked.post.mockResolvedValue({ data: { data: WIRE } });
    await blockBorrower('b1', ' Paid late ');
    expect(mocked.post).toHaveBeenLastCalledWith('/lending/borrowers/b1/block', {
      reason: 'Paid late',
    });
    await blockBorrower('b1', '  ');
    expect(mocked.post).toHaveBeenLastCalledWith('/lending/borrowers/b1/block', {
      reason: undefined,
    });
    await unblockBorrower('b1');
    expect(mocked.post).toHaveBeenLastCalledWith('/lending/borrowers/b1/unblock', {});
  });
});

it('passes borrower page requests and reads total metadata for scroll loading', async () => {
  mocked.get.mockResolvedValue({
    data: { data: [WIRE], meta: { page: 2, total: 60, total_pages: 3 } },
  });
  const page = await listBorrowers({ page: '2', status: 'active' });
  expect(mocked.get.mock.calls[0]?.[0]).toContain('page=2');
  expect(page).toMatchObject({ page: 2, total: 60, totalPages: 3 });
});
