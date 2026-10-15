import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { EnrolMemberDrawer } from './EnrolMemberDrawer';

import type { MembershipType } from '../types/member.types';
import type { SeatMap, LibrarySeat, LibraryShift } from '../types/seat.types';

/**
 * QA B26 — admitting a student. Two defects: the newest plan was pre-selected, so
 * a ₹0 plan quietly admitted students who then read "Paid"; and how the student
 * pays was two switches whose combinations had to be worked out. The plan now
 * starts empty and is required, and one question offers the three real answers.
 */
let mockSeating: {
  map: SeatMap | null;
  seats: readonly LibrarySeat[];
  activeShifts: readonly LibraryShift[];
  loading: boolean;
  mapStatus: string;
};
beforeEach(() => {
  mockSeating = { map: null, seats: [], activeShifts: [], loading: false, mapStatus: 'idle' };
});
jest.mock('../hooks/useSeats', () => ({ useSeats: () => mockSeating }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/library/members',
  useSearchParams: () => new URLSearchParams(),
}));

const plan = (over: Partial<MembershipType>): MembershipType => ({
  id: 'monthly',
  name: 'Monthly',
  maxCopies: 2,
  loanDays: 14,
  feeAmount: '900.00',
  admissionFee: '0.00',
  depositAmount: '0.00',
  validityMonths: 1,
  isActive: true,
  version: 1,
  ...over,
});

const TYPES = [
  plan({}),
  plan({ id: 'standard', name: 'Standard', feeAmount: '0.00', validityMonths: null }),
];

const render = () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  renderWithProviders(
    <EnrolMemberDrawer types={TYPES} busy={false} onClose={jest.fn()} onSubmit={onSubmit} />
  );
  return onSubmit;
};

describe('admitting a student (QA B26)', () => {
  it('starts with no plan chosen and asks for one', async () => {
    const user = userEvent.setup();
    const onSubmit = render();
    expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveTextContent('Choose a plan');
    await user.type(screen.getByLabelText(/^Name/), 'Asha Kumari');
    await user.click(screen.getByTestId('library-enrol-save'));
    expect(await screen.findByText('Choose a plan.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('asks how the student is paying, and "Pay later" sends no collection', async () => {
    const user = userEvent.setup();
    const onSubmit = render();
    await user.click(screen.getByRole('combobox', { name: 'Plan' }));
    await user.click(await screen.findByRole('option', { name: 'Monthly' }));
    expect(screen.getByRole('radio', { name: 'Collect now' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Already paid (old student)' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Pay later' }));
    expect(
      screen.getByText('The fees and the deposit are added to what is due.')
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Name/), 'Asha Kumari');
    await user.click(screen.getByTestId('library-enrol-save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      membershipTypeId: 'monthly',
      collectNow: false,
      existingStudent: false,
    });
  });

  it('offers a free plan "New student" or "Already paid", never "Collect now"', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('combobox', { name: 'Plan' }));
    await user.click(await screen.findByRole('option', { name: 'Standard' }));
    expect(screen.getByRole('radio', { name: 'New student' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Collect now' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Already paid (old student)' }));
    expect(screen.getByTestId('library-enrol-existing')).toBeInTheDocument();
  });
});

it('keeps a contextual seat only while the server says it is available', async () => {
  // A seat selected from the map must not bypass a new availability response in admission.
  const shift = {
    id: 'morning',
    name: 'Morning',
    startsAt: '06:00',
    endsAt: '12:00',
    isActive: true,
    sortOrder: 0,
    version: 1,
  };
  const seat = { id: 'a1', label: 'A1', zone: '', isActive: true, version: 1 };
  mockSeating = {
    loading: false,
    mapStatus: 'succeeded',
    seats: [seat],
    activeShifts: [shift],
    map: {
      shiftId: 'morning',
      seats: [
        {
          ...seat,
          occupants: [],
          holders: [],
          takenShiftIds: [],
          dayState: 'free',
          viewState: 'free',
        },
      ],
      counts: { free: 1 },
      shiftCounts: [],
    },
  };
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  const view = renderWithProviders(
    <EnrolMemberDrawer
      types={TYPES}
      busy={false}
      initialPlacement={{ seatId: 'a1', shiftId: 'morning' }}
      onClose={jest.fn()}
      onSubmit={onSubmit}
    />
  );
  expect(screen.getByRole('button', { name: /Morning/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'A1, Available' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  const currentMap = mockSeating.map;
  if (!currentMap) throw new Error('Expected a loaded seat map');
  mockSeating = { ...mockSeating, map: { ...currentMap, seats: [] } };
  view.rerender(
    <EnrolMemberDrawer
      types={TYPES}
      busy={false}
      initialPlacement={{ seatId: 'a1', shiftId: 'morning' }}
      onClose={jest.fn()}
      onSubmit={onSubmit}
    />
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'A1, Taken' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  );
  expect(screen.getByRole('button', { name: 'A1, Taken' })).toBeDisabled();
});

it('keeps optional student details out of the first view without losing entered values', async () => {
  // Collapsing extra fields must simplify admission without discarding a guardian or locker.
  const user = userEvent.setup();
  const onSubmit = render();
  expect(screen.queryByLabelText(/Guardian's name/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Other details (optional)' }));
  await user.type(screen.getByLabelText(/Guardian's name/), 'Suresh Kumar');
  await user.type(screen.getByLabelText(/^Locker/), 'L-7');
  await user.click(screen.getByRole('button', { name: 'Other details (optional)' }));
  await user.type(screen.getByLabelText(/^Name/), 'Asha Kumari');
  await user.click(screen.getByRole('combobox', { name: 'Plan' }));
  await user.click(await screen.findByRole('option', { name: 'Monthly' }));
  await user.click(screen.getByRole('radio', { name: 'Pay later' }));
  await user.click(screen.getByTestId('library-enrol-save'));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
    guardianName: 'Suresh Kumar',
    lockerLabel: 'L-7',
  });
});

it('replaces saved people search with manual entry and a phone contact fallback', () => {
  render();
  expect(screen.queryByText('Someone in my book')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Choose phone contact' })).toBeDisabled();
  expect(screen.getByLabelText(/^Name/)).toBeEnabled();
});
it('fills editable admission fields from a chosen phone contact', async () => {
  const pick = jest.fn().mockResolvedValue([{ name: ['Asha Contact'], tel: ['+919876543210'] }]);
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: pick } });
  try {
    render();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Choose phone contact' }));
    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toHaveValue('Asha Contact'));
    expect(pick).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/^Mobile/)).toHaveValue('9876543210');
  } finally {
    Reflect.deleteProperty(window, 'isSecureContext');
    Reflect.deleteProperty(navigator, 'contacts');
  }
});
