import { api } from 'src/api/AxiosInstances';

import { getSchedule, listDues, toBackdatedConfirmation, toDue } from './duesService';

/**
 * DUE-01 — the dues service is tested on what it SENDS and how it reads what
 * comes back (the statement service's rule).
 */
jest.mock('src/api/AxiosInstances', () => ({
  api: { get: jest.fn() },
  ubConfig: (extras: unknown) => extras,
}));

const DUE = {
  id: 'd1',
  schedule_id: 's1',
  module: 'gym',
  subject: { type: 'gym_membership', id: 'm1', label: 'Rahul · Gold' },
  party: { id: 'p1', name: 'Rahul' },
  seq: 4,
  period_start: '2026-10-01',
  period_end: '2026-11-01',
  period_label: 'Oct 2026',
  due_on: '2026-10-01',
  amount: '1200.00',
  penalty_amount: '0.00',
  waived_amount: '0.00',
  settled_amount: '200.00',
  outstanding: '1000.00',
  status: 'overdue',
  paid_on: null,
  document: null,
};

beforeEach(() => jest.mocked(api.get).mockReset());

it('reads a due as the screens use it', () => {
  expect(toDue(DUE)).toMatchObject({
    scheduleId: 's1',
    subject: { label: 'Rahul · Gold' },
    periodLabel: 'Oct 2026',
    outstanding: '1000.00',
    status: 'overdue',
    document: null,
  });
});

it('sends the filters, statuses as one csv, and keeps the server totals', async () => {
  /** `meta.totals` is the server's figure over the FILTERED set; it is not re-summed here. */
  jest.mocked(api.get).mockResolvedValue({
    data: {
      data: [DUE],
      meta: { next_cursor: 'c2', has_more: true, totals: { outstanding: '9.00', overdue: '7.00' } },
    },
  });
  const page = await listDues({ partyId: 'p1', status: ['due', 'overdue'], cursor: 'c1' });
  const url = jest.mocked(api.get).mock.calls[0]?.[0] ?? '';
  expect(url).toContain('/dues/dues?');
  expect(url).toContain('party_id=p1');
  expect(url).toContain('status=due%2Coverdue');
  expect(url).toContain('cursor=c1');
  expect(page.totals).toEqual({ outstanding: '9.00', overdue: '7.00' });
  expect(page).toMatchObject({ nextCursor: 'c2', hasMore: true });
  expect(page.rows).toHaveLength(1);
});

it('reads a schedule with its dues and pauses', async () => {
  jest.mocked(api.get).mockResolvedValue({
    data: {
      data: {
        id: 's1',
        module: 'gym',
        plan: { id: 'pl1', name: 'Gym monthly' },
        party: { id: 'p1', name: 'Rahul' },
        beneficiary_party: null,
        subject: DUE.subject,
        status: 'active',
        start_on: '2026-07-01',
        end_on: null,
        amount: '1200.00',
        grace_days: 3,
        version: 1,
        dues: [DUE],
        pauses: [
          {
            id: 'x',
            from_on: '2026-12-01',
            to_on: '2026-12-15',
            effect: 'shift',
            reason: 'Travel',
            resumed_on: null,
          },
        ],
      },
    },
  });
  const schedule = await getSchedule('s1');
  expect(jest.mocked(api.get).mock.calls[0]?.[0]).toBe('/dues/schedules/s1');
  expect(schedule.plan.name).toBe('Gym monthly');
  expect(schedule.dues[0]?.dueOn).toBe('2026-10-01');
  expect(schedule.pauses[0]).toMatchObject({ effect: 'shift', reason: 'Travel' });
});

it('reads the backdated 409 into the rows and total the confirmation states', () => {
  /** "This adds 4 dues totalling ₹4,800" must be the server's total, not a client sum. */
  const confirm = toBackdatedConfirmation({
    dues: [
      {
        seq: 1,
        period_start: '2026-07-01',
        period_end: '2026-08-01',
        period_label: 'Jul 2026',
        due_on: '2026-07-01',
        amount: '1200.00',
        status: 'scheduled',
      },
    ],
    total: '4800.00',
  });
  expect(confirm.total).toBe('4800.00');
  expect(confirm.dues[0]).toMatchObject({ periodLabel: 'Jul 2026', amount: '1200.00' });
  expect(confirm.dues[0]?.components).toBeUndefined();
});
