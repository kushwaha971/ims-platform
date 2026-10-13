import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { EnrolMemberDrawer } from './EnrolMemberDrawer';

import type { MembershipType } from '../types/member.types';

/**
 * QA B26 — admitting a student. Two defects: the newest plan was pre-selected, so
 * a ₹0 plan quietly admitted students who then read "Paid"; and how the student
 * pays was two switches whose combinations had to be worked out. The plan now
 * starts empty and is required, and one question offers the three real answers.
 */
jest.mock('../hooks/useSeats', () => ({
  useSeats: () => ({ map: null, seats: [], activeShifts: [], loading: false }),
}));
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
    expect(screen.getByLabelText('Plan')).toHaveValue('');
    await user.type(screen.getByLabelText(/^Name/), 'Asha Kumari');
    await user.click(screen.getByTestId('library-enrol-save'));
    expect(await screen.findByText('Choose a plan.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('asks how the student is paying, and "Pay later" sends no collection', async () => {
    const user = userEvent.setup();
    const onSubmit = render();
    await user.selectOptions(screen.getByLabelText('Plan'), 'monthly');
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
    await user.selectOptions(screen.getByLabelText('Plan'), 'standard');
    expect(screen.getByRole('radio', { name: 'New student' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Collect now' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Already paid (old student)' }));
    expect(screen.getByTestId('library-enrol-existing')).toBeInTheDocument();
  });
});
