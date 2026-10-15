import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import * as service from '../api/lendingService';

import { BorrowersPageContent } from './BorrowersPageContent';
import { LoansPageContent } from './LoansPageContent';

import type { BorrowerRow } from '../types/lending.types';

/**
 * Owner, 12 Oct 2026 — "edit, block … for every type of user", and "these
 * access should be only for admin or owner, not other users". What these
 * protect:
 *  - the ⋯ with Edit and Block is the owner's and an admin's only; staff, who
 *    hold `lending.borrower.write` to add borrowers with a loan, never see it;
 *  - Block asks first, sends the optional reason, and the page then says
 *    "Blocked" and stops offering "+ Loan" — to everybody, because the
 *    collector at the door is who must not promise a new loan;
 *  - a blocked borrower is unblocked from the same ⋯;
 *  - Edit sends the version it loaded, so two editors cannot undo each other;
 *  - the Borrowers list marks a blocked row and filters by status.
 */
jest.mock('../api/lendingService', () => ({
  ...jest.requireActual('../api/lendingService'),
  listLoans: jest.fn(),
  listBorrowers: jest.fn(),
  getBorrower: jest.fn(),
  updateBorrower: jest.fn(),
  blockBorrower: jest.fn(),
  unblockBorrower: jest.fn(),
  getToday: jest.fn(),
}));
let params = new URLSearchParams('borrower=b1');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/lending/loans',
  useSearchParams: () => params,
}));

const PERMS = [
  'lending.loan.read',
  'lending.loan.create',
  'lending.borrower.read',
  'lending.borrower.write',
] as PermissionCode[];

const signIn = (role: string): void => {
  const tenant = { id: 't1', name: 'Shree Finance', timezone: 'Asia/Kolkata', role };
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Someone',
        email: 'someone@lend.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: tenant,
      tenants: [tenant],
      permissions: PERMS,
      enabledModules: ['lending'],
      version: 1,
    })
  );
};

const geeta = (over: Partial<BorrowerRow> = {}): BorrowerRow => ({
  id: 'b1',
  number: 'B-0001',
  partyId: 'p1',
  name: 'Geeta Devi',
  mobile: '+919820011223',
  area: 'Camp',
  route: null,
  status: 'active',
  blockedReason: '',
  notes: '',
  version: 4,
  summary: {
    loans: 1,
    running: 1,
    given: '5000.00',
    collected: '500.00',
    left: '4500.00',
    late: '0.00',
  },
  ...over,
});

beforeEach(() => {
  params = new URLSearchParams('borrower=b1');
  jest
    .mocked(service.listLoans)
    .mockResolvedValue({ rows: [], hasLoans: true, total: 0, page: 1, totalPages: 0 });
});

describe('the borrower page ⋯', () => {
  it.each(['owner', 'admin'])('is there for the %s, with Edit and Block', async (role) => {
    jest.mocked(service.getBorrower).mockResolvedValue(geeta());
    signIn(role);
    renderWithProviders(<LoansPageContent />);
    await userEvent.click(await screen.findByTestId('lending-borrower-menu'));
    expect(await screen.findByTestId('lending-borrower-edit')).toBeInTheDocument();
    expect(screen.getByTestId('lending-borrower-block')).toBeInTheDocument();
    expect(screen.queryByTestId('lending-borrower-unblock')).not.toBeInTheDocument();
  });

  it('is never drawn for staff, who still see the page and its "+ Loan"', async () => {
    jest.mocked(service.getBorrower).mockResolvedValue(geeta());
    signIn('staff');
    renderWithProviders(<LoansPageContent />);
    expect(await screen.findByRole('heading', { name: 'Geeta Devi' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Loan/ })).toBeInTheDocument();
    expect(screen.queryByTestId('lending-borrower-menu')).not.toBeInTheDocument();
  });

  it('blocks after a confirm, with the reason, then shows Blocked and hides "+ Loan"', async () => {
    jest.mocked(service.getBorrower).mockResolvedValue(geeta());
    const block = jest
      .mocked(service.blockBorrower)
      .mockResolvedValue(geeta({ status: 'blocked', blockedReason: 'Paid late twice' }));
    signIn('owner');
    renderWithProviders(<LoansPageContent />);
    expect(await screen.findByRole('link', { name: /Loan/ })).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lending-borrower-menu'));
    await userEvent.click(await screen.findByTestId('lending-borrower-block'));
    // The consequence is said before anything is sent.
    expect(await screen.findByTestId('lending-borrower-block-body')).toBeInTheDocument();
    expect(block).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole('textbox'), 'Paid late twice');
    await userEvent.click(screen.getByTestId('lending-borrower-block-confirm'));
    await waitFor(() => expect(block).toHaveBeenCalledWith('b1', 'Paid late twice'));
    const banner = await screen.findByTestId('lending-borrower-blocked');
    expect(banner).toHaveTextContent('Blocked');
    expect(screen.queryByRole('link', { name: /Loan/ })).not.toBeInTheDocument();
  });

  it('cancelling the block sends nothing', async () => {
    jest.mocked(service.getBorrower).mockResolvedValue(geeta());
    const block = jest.mocked(service.blockBorrower);
    block.mockClear();
    signIn('owner');
    renderWithProviders(<LoansPageContent />);
    await userEvent.click(await screen.findByTestId('lending-borrower-menu'));
    await userEvent.click(await screen.findByTestId('lending-borrower-block'));
    const body = await screen.findByTestId('lending-borrower-block-body');
    const dialog = body.closest('[role="dialog"]') as HTMLElement;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByTestId('lending-borrower-block-body')).not.toBeInTheDocument()
    );
    expect(block).not.toHaveBeenCalled();
  });

  it('shows a blocked borrower as Blocked, with the reason, to staff too', async () => {
    jest
      .mocked(service.getBorrower)
      .mockResolvedValue(geeta({ status: 'blocked', blockedReason: 'Moved away' }));
    signIn('staff');
    renderWithProviders(<LoansPageContent />);
    const banner = await screen.findByTestId('lending-borrower-blocked');
    expect(banner).toHaveTextContent(/Reason: /);
    expect(screen.queryByRole('link', { name: /Loan/ })).not.toBeInTheDocument();
  });

  it('unblocks from the same ⋯, after a confirm', async () => {
    jest.mocked(service.getBorrower).mockResolvedValue(geeta({ status: 'blocked' }));
    const unblock = jest.mocked(service.unblockBorrower).mockResolvedValue(geeta());
    signIn('owner');
    renderWithProviders(<LoansPageContent />);
    await userEvent.click(await screen.findByTestId('lending-borrower-menu'));
    expect(screen.queryByTestId('lending-borrower-block')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByTestId('lending-borrower-unblock'));
    const dialog = await screen.findByRole('dialog', { name: /^Unblock / });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unblock' }));
    await waitFor(() => expect(unblock).toHaveBeenCalledWith('b1'));
    await waitFor(() =>
      expect(screen.queryByTestId('lending-borrower-blocked')).not.toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: /Loan/ })).toBeInTheDocument();
  });

  it('edits with the version it loaded and shows the new name', async () => {
    jest.mocked(service.getBorrower).mockResolvedValue(geeta());
    const saved = geeta({ name: 'Geeta Sharma', version: 5 });
    // The save makes the page re-read the borrower: from then on the server
    // holds the new name, as it would.
    const update = jest.mocked(service.updateBorrower).mockImplementation(async () => {
      jest.mocked(service.getBorrower).mockResolvedValue(saved);
      return saved;
    });
    signIn('owner');
    renderWithProviders(<LoansPageContent />);
    await userEvent.click(await screen.findByTestId('lending-borrower-menu'));
    await userEvent.click(await screen.findByTestId('lending-borrower-edit'));
    const name = await screen.findByDisplayValue('Geeta Devi');
    await userEvent.clear(name);
    await userEvent.type(name, 'Geeta Sharma');
    await userEvent.click(screen.getByTestId('lending-borrower-edit-save'));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        'b1',
        { name: 'Geeta Sharma', mobile: '+919820011223', area: 'Camp', notes: '' },
        4
      )
    );
    expect(await screen.findByRole('heading', { name: 'Geeta Sharma' })).toBeInTheDocument();
  });
});

describe('the Borrowers list', () => {
  it('marks a blocked row and asks the server for one status', async () => {
    params = new URLSearchParams();
    const list = jest.mocked(service.listBorrowers).mockResolvedValue({
      rows: [geeta({ status: 'blocked' }), geeta({ id: 'b2', name: 'Ramesh Kumar' })],
      totals: null,
    });
    signIn('owner');
    renderWithProviders(<BorrowersPageContent />);
    const grid = await screen.findByTestId('lending-borrowers');
    await waitFor(() =>
      expect(within(grid).getAllByText('Ramesh Kumar').length).toBeGreaterThan(0)
    );
    expect(within(grid).getAllByText('Blocked').length).toBeGreaterThan(0);
    expect(list).toHaveBeenLastCalledWith({ q: '', status: 'all', page: '1' }, expect.anything());
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^Status`) }));
    await userEvent.click(await screen.findByRole('option', { name: 'Blocked' }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        { q: '', status: 'blocked', page: '1' },
        expect.anything()
      )
    );
  });
});
