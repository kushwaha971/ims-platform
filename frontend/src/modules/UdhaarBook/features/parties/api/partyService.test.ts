import { api } from 'src/api/AxiosInstances';

import { listParties } from './partyService';

/**
 * The walking skeleton's wire half (Part 32 S0-71): the service builds the path
 * and the query from the canon's inventory, and maps the snake_case envelope of
 * Part 22 §22.1 onto the domain shape — with money left as a STRING.
 *
 * MSW is not used (§19.13.3): the transport is stubbed at the module boundary
 * and the fixture body is copied from the Part 22 example, so a contract change
 * breaks this test and the backend's together.
 */
describe('partyService.listParties', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls GET /parties with the documented query parameters', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue({
      data: { data: [], meta: { page: 1, page_size: 25, total: 0, total_pages: 0 } },
    });

    await listParties({ q: 'ram', status: 'active', ordering: '-last_activity_at', page: 2, pageSize: 25 });

    expect(get).toHaveBeenCalledTimes(1);
    const url = get.mock.calls[0]?.[0] as string;
    expect(url).toContain('/parties?');
    expect(url).toContain('q=ram');
    expect(url).toContain('status=active');
    expect(url).toContain('ordering=-last_activity_at');
    expect(url).toContain('page=2');
    expect(url).toContain('page_size=25');
  });

  it('omits an empty search rather than sending q=', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue({
      data: { data: [], meta: { page: 1, page_size: 25, total: 0, total_pages: 0 } },
    });

    await listParties({ q: '', status: 'active', ordering: '-last_activity_at', page: 1, pageSize: 25 });

    expect(get.mock.calls[0]?.[0] as string).not.toContain('q=');
  });

  it('maps the envelope to the domain shape and keeps the balance a string', async () => {
    jest.spyOn(api, 'get').mockResolvedValue({
      data: {
        data: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Ramesh Traders',
            display_code: 'C-001',
            mobile: '+919876543210',
            is_customer: true,
            is_supplier: false,
            balance: '2800.00',
            status: 'active',
            last_activity_at: '2026-09-18T10:00:00Z',
          },
        ],
        meta: { page: 1, page_size: 25, total: 1, total_pages: 1 },
      },
    });

    const result = await listParties({
      q: '',
      status: 'active',
      ordering: '-last_activity_at',
      page: 1,
      pageSize: 25,
    });

    expect(result.meta).toEqual({ page: 1, pageSize: 25, total: 1, totalPages: 1 });
    expect(result.rows[0]?.displayCode).toBe('C-001');
    expect(result.rows[0]?.isCustomer).toBe(true);
    expect(result.rows[0]?.lastActivityAt).toBe('2026-09-18T10:00:00Z');
    // Money crosses the boundary as a string and stays one (R-TS-7).
    expect(result.rows[0]?.balance).toBe('2800.00');
    expect(typeof result.rows[0]?.balance).toBe('string');
  });
});
