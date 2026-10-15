import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbText } from 'src/design-system';
import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/librarySeatService';

import { SeatsPageContent } from './SeatsPageContent';

jest.mock('./MemberDetailDrawer', () => ({
  MemberDetailDrawer: ({ id }: { id: string }) => <UbText>Student drawer {id}</UbText>,
}));

import type { LibraryShift, SeatMap, SeatMapRow, SeatOccupant } from '../types/seat.types';

/**
 * QA F6 (owner, 12 Oct 2026) — the seat map across the whole day. What these pin is
 * what the librarian reads: a desk shared by a morning and an evening student says
 * Full and lists both with their hours; a desk taken in one shift says which; in a
 * shift's own view a desk held by another, overlapping shift says "Other shift"
 * instead of borrowing that student's fee colour; every colour has a word in the
 * legend; and the counts are per shift.
 */
jest.mock('../api/librarySeatService', () => ({
  ...jest.requireActual('../api/librarySeatService'),
  listShifts: jest.fn(),
  listSeats: jest.fn(),
  getSeatMap: jest.fn(),
}));

const shift = (id: string, name: string, startsAt: string, endsAt: string): LibraryShift => ({
  id,
  name,
  startsAt,
  endsAt,
  isActive: true,
  sortOrder: 0,
  version: 1,
});
const MORNING = shift('m', 'Morning', '06:00', '12:00');
const EVENING = shift('e', 'Evening', '12:00', '18:00');

const person = (
  id: string,
  name: string,
  on: LibraryShift | null,
  extra: Partial<SeatOccupant> = {}
): SeatOccupant => ({
  membershipId: id,
  name,
  memberNumber: `M-${id}`,
  mobile: '9876500000',
  shift: on ? { id: on.id, name: on.name, startsAt: on.startsAt, endsAt: on.endsAt } : null,
  validUntil: '2026-10-31',
  feeState: 'paid',
  duesAmount: '0.00',
  inView: true,
  otherShift: false,
  version: 1,
  ...extra,
});

const seat = (label: string, extra: Partial<SeatMapRow>): SeatMapRow => ({
  id: label,
  label,
  zone: 'AC hall',
  isActive: true,
  version: 1,
  occupants: [],
  holders: [],
  takenShiftIds: [],
  dayState: 'free',
  viewState: 'free',
  ...extra,
});

const asha = person('1', 'Asha', MORNING);
const imran = person('2', 'Imran', EVENING, { feeState: 'unpaid', duesAmount: '900.00' });

const WHOLE_DAY: SeatMap = {
  shiftId: '',
  seats: [
    seat('A1', {
      holders: [asha, imran],
      occupants: [asha, imran],
      takenShiftIds: ['m', 'e'],
      dayState: 'full',
    }),
    seat('A2', {
      holders: [imran],
      occupants: [imran],
      takenShiftIds: ['e'],
      dayState: 'partial',
    }),
    seat('A3', {}),
  ],
  counts: { occupied: 2, free: 1 },
  shiftCounts: [
    { id: 'm', name: 'Morning', taken: 1, total: 3 },
    { id: 'e', name: 'Evening', taken: 2, total: 3 },
  ],
};

const EVENING_VIEW: SeatMap = {
  shiftId: 'e',
  seats: [
    seat('A1', {
      holders: [{ ...asha, inView: false }, imran],
      occupants: [imran],
      viewState: 'taken',
    }),
    seat('A2', {
      holders: [{ ...asha, otherShift: true }],
      occupants: [{ ...asha, otherShift: true }],
      viewState: 'other_shift',
    }),
    seat('A3', {}),
  ],
  counts: { occupied: 2, free: 1 },
  shiftCounts: WHOLE_DAY.shiftCounts,
};

beforeEach(() => {
  store.dispatch(resetAllFeatureState());
  jest.clearAllMocks();
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@library.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Saraswati Library', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Saraswati Library', timezone: 'Asia/Kolkata' }],
      permissions: ['library.member.read', 'library.member.write', 'payments.payment.write'],
      enabledModules: ['library', 'payments'],
      version: 1,
    })
  );
  jest.mocked(service.listShifts).mockResolvedValue([MORNING, EVENING]);
  jest.mocked(service.listSeats).mockResolvedValue(
    WHOLE_DAY.seats.map(({ id, label, zone, isActive, version }) => ({
      id,
      label,
      zone,
      isActive,
      version,
    }))
  );
  jest
    .mocked(service.getSeatMap)
    .mockImplementation(async (shiftId: string) => (shiftId ? EVENING_VIEW : WHOLE_DAY));
});

describe('SeatsPageContent — the whole day (QA F6)', () => {
  it('opens on the whole day: Full, the one shift taken, Free — and per-shift counts', async () => {
    renderWithProviders(<SeatsPageContent />);
    expect(await screen.findByTestId('library-seats-screen')).toBeInTheDocument();
    expect(service.getSeatMap).toHaveBeenCalledWith('', expect.anything());
    expect(within(screen.getByTestId('seat-A1')).getByText('Full')).toBeInTheDocument();
    expect(within(screen.getByTestId('seat-A2')).getByText('1 of 2 shifts')).toBeInTheDocument();
    expect(within(screen.getByTestId('seat-A3')).getByText('Free')).toBeInTheDocument();
    expect(screen.getByTestId('library-seats-counts')).toHaveTextContent(
      'Morning 1/3 · Evening 2/3'
    );
    // Occupancy and fee remain distinct, with the fee also in the accessible name.
    expect(screen.getByTestId('seat-A2')).toHaveAccessibleName('Seat A2, Evening, Unpaid');
  });

  it('lists both students of a shared seat, with their shift hours', async () => {
    renderWithProviders(<SeatsPageContent />);
    await userEvent.click(await screen.findByTestId('seat-A1'));
    const panel = screen.getByTestId('library-seat-detail');
    expect(within(panel).getByText('Asha')).toBeInTheDocument();
    expect(within(panel).getByText('Imran')).toBeInTheDocument();
    const morningStudent = within(screen.getByTestId('library-seat-holder-1'));
    expect(morningStudent.getByText('Morning')).toBeInTheDocument();
    expect(morningStudent.getByText('06:00–12:00')).toBeInTheDocument();
    const eveningStudent = within(screen.getByTestId('library-seat-holder-2'));
    expect(eveningStudent.getByText('Evening')).toBeInTheDocument();
    expect(eveningStudent.getByText('12:00–18:00')).toBeInTheDocument();
    expect(within(panel).getByText('Collect ₹900.00')).toBeInTheDocument();
  });

  it('explains every colour in words', async () => {
    renderWithProviders(<SeatsPageContent />);
    await screen.findByTestId('library-seats-screen');
    await userEvent.click(screen.getByRole('button', { name: 'What the colours mean' }));
    const legend = await screen.findByTestId('library-seats-legend');
    for (const word of ['Free', 'Part taken', 'Full', 'Paid', 'Due soon', 'Unpaid', 'Overdue']) {
      expect(within(legend).getByText(word)).toBeInTheDocument();
    }
  });

  it('narrows to free seats, or to seats where somebody owes', async () => {
    renderWithProviders(<SeatsPageContent />);
    await screen.findByTestId('library-seats-screen');
    await userEvent.click(screen.getByRole('button', { name: 'Free only' }));
    expect(screen.queryByTestId('seat-A1')).not.toBeInTheDocument();
    expect(screen.getByTestId('seat-A3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Free only' }));
    await userEvent.click(screen.getByRole('button', { name: 'Unpaid only' }));
    expect(screen.getByTestId('seat-A1')).toBeInTheDocument();
    expect(screen.getByTestId('seat-A2')).toBeInTheDocument();
    expect(screen.queryByTestId('seat-A3')).not.toBeInTheDocument();
  });
});

describe('SeatsPageContent — one shift (QA F6)', () => {
  it('marks a seat held by another shift as such, and still lists its student', async () => {
    renderWithProviders(<SeatsPageContent />);
    await screen.findByTestId('library-seats-screen');
    await userEvent.click(screen.getByRole('button', { name: /^Shift: Whole day/ }));
    const list = await screen.findByRole('listbox');
    await userEvent.click(within(list).getByRole('option', { name: /Evening/ }));
    expect(service.getSeatMap).toHaveBeenLastCalledWith('e', expect.anything());
    const a2 = await screen.findByRole('button', { name: 'Seat A2, Other shift' });
    expect(within(a2).getByText('Other shift')).toBeInTheDocument();
    expect(within(screen.getByTestId('seat-A1')).getByText('Unpaid')).toBeInTheDocument();
    await userEvent.click(a2);
    const panel = screen.getByTestId('library-seat-detail');
    expect(within(panel).getByText('Asha')).toBeInTheDocument();
    const holder = within(screen.getByTestId('library-seat-holder-1'));
    expect(holder.getByText('Morning')).toBeInTheDocument();
    expect(holder.getByText('06:00–12:00')).toBeInTheDocument();
    // The legend in a shift's view names the other-shift tile too.
    expect(
      within(screen.getByTestId('library-seats-legend')).getByText('Other shift')
    ).toBeInTheDocument();
  });
});

describe('reference seat workspace', () => {
  it('finds a desk by its student and opens details in a dismissible sheet', async () => {
    // Prevents students being hidden behind desk labels and below a long mobile map.
    renderWithProviders(<SeatsPageContent />);
    await screen.findByTestId('library-seats-screen');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search seat or student' }), 'Asha');
    expect(screen.getByTestId('seat-A1')).toBeInTheDocument();
    expect(screen.queryByTestId('seat-A2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('seat-A3')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('seat-A1'));
    const sheet = await screen.findByRole('dialog', { name: 'Seat A1' });
    expect(within(sheet).getByText('Imran')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Seat A1' })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('Asha');
  });

  it('shows server occupancy counts and filters part-taken seats without treating them as empty', async () => {
    // A partly allocated desk has free shifts but is not free for the whole day.
    renderWithProviders(<SeatsPageContent />);
    const summary = await screen.findByTestId('library-seat-occupancy');
    expect(summary).toHaveTextContent('Free1');
    expect(summary).toHaveTextContent('Part taken1');
    expect(summary).toHaveTextContent('Full1');
    await userEvent.click(screen.getByRole('button', { name: 'Part taken' }));
    expect(screen.getByTestId('seat-A2')).toBeInTheDocument();
    expect(screen.queryByTestId('seat-A1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('seat-A3')).not.toBeInTheDocument();
  });
});

it('suggests an admission only in a genuinely available shift of the selected desk', async () => {
  // Full desks must not advertise a preselected admission; partial desks preserve the free shift.
  renderWithProviders(<SeatsPageContent />);
  await userEvent.click(await screen.findByTestId('seat-A2'));
  let sheet = await screen.findByRole('dialog', { name: 'Seat A2' });
  expect(within(sheet).getByRole('link', { name: 'New admission' })).toHaveAttribute(
    'href',
    '/library/members?add=1&seat=A2&admitShift=m'
  );
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByTestId('seat-A1'));
  sheet = await screen.findByRole('dialog', { name: 'Seat A1' });
  expect(within(sheet).queryByRole('link', { name: 'New admission' })).not.toBeInTheDocument();
});

it('keeps a reader’s seat details useful without advertising write-only actions', async () => {
  // Read-only users can view a student, but must not be invited to collect money or alter placement.
  const current = store.getState().session;
  if (!current.user) throw new Error('Expected the reader fixture user');
  store.dispatch(
    sessionLoaded({
      user: current.user,
      activeTenant: current.activeTenant,
      tenants: current.tenants,
      permissions: ['library.member.read'],
      enabledModules: ['library'],
      version: 1,
    })
  );
  renderWithProviders(<SeatsPageContent />);
  await userEvent.click(await screen.findByTestId('seat-A1'));
  const sheet = await screen.findByRole('dialog', { name: 'Seat A1' });
  expect(within(sheet).getAllByRole('link', { name: 'Open student' })).toHaveLength(2);
  expect(within(sheet).queryByRole('link', { name: /Collect/ })).not.toBeInTheDocument();
  expect(within(sheet).queryByRole('button', { name: 'Free seat' })).not.toBeInTheDocument();
  expect(within(sheet).queryByRole('button', { name: 'Message' })).not.toBeInTheDocument();
});

it('opens student details from the seat sheet without navigating away', async () => {
  renderWithProviders(<SeatsPageContent />);
  await screen.findByTestId('library-seats-screen');
  await userEvent.click(screen.getByTestId('seat-A1'));
  const holder = await screen.findByTestId('library-seat-holder-2');
  await userEvent.click(within(holder).getByRole('link', { name: 'Collect ₹900.00' }));
  expect(await screen.findByText('Student drawer 2')).toBeInTheDocument();
  expect(screen.getByTestId('library-seats-screen')).toBeInTheDocument();
});
