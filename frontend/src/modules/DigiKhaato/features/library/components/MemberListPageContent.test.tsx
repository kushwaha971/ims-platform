import { fireEvent, screen, waitFor } from '@testing-library/react';

import { UbButton } from 'src/design-system';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { MEMBER_FILTER_DEFAULTS } from '../constants/memberConstants';
import { useMemberList, type MemberList } from '../hooks/useMemberList';

import { MemberListPageContent } from './MemberListPageContent';

jest.mock('../hooks/useMemberList');
jest.mock('./MemberDetailDrawer', () => ({
  MemberDetailDrawer: ({ id, onClose }: { id: string; onClose: () => void }) => (
    <UbButton onClick={onClose}>Close student {id}</UbButton>
  ),
}));
let mockParams = new URLSearchParams();
let mockSeats = {
  activeShifts: [] as { id: string }[],
  seats: [] as { id: string; isActive: boolean }[],
  listsStatus: 'loading',
};
beforeEach(() => {
  mockParams = new URLSearchParams();
  mockSeats = { activeShifts: [], seats: [], listsStatus: 'loading' };
});
jest.mock('../hooks/useSeats', () => ({ useSeats: () => mockSeats }));
jest.mock('./EnrolMemberDrawer', () => ({
  EnrolMemberDrawer: ({
    initialPlacement,
  }: {
    initialPlacement?: { seatId: string; shiftId: string };
  }) => (
    <>
      {initialPlacement
        ? `${initialPlacement.seatId}:${initialPlacement.shiftId}`
        : 'No suggested seat'}
    </>
  ),
}));
jest.mock('../api/libraryMemberService', () => ({ listMembershipTypes: jest.fn(async () => []) }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => mockParams,
}));

const mockList = jest.mocked(useMemberList);
const pending = {
  filters: MEMBER_FILTER_DEFAULTS,
  status: 'loading',
  rows: [],
  types: [],
  totals: null,
  hasAny: null,
  canRead: true,
  canWrite: false,
  error: null,
  narrowed: false,
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 1,
  setFilters: jest.fn(),
  clearFilters: jest.fn(),
  refetch: jest.fn(),
  setPage: jest.fn(),
} as unknown as MemberList;

/** B18: loaded totals must replace a reserved slot above search, not insert a new row. */
it('keeps the summary slot while totals load and reuses it when they arrive', () => {
  mockList.mockReturnValue(pending);
  const { rerender } = renderWithProviders(<MemberListPageContent />);
  const slot = screen.getByTestId('library-members-summary');
  expect(slot).toHaveClass('min-h-5');
  expect(slot).toHaveAttribute('aria-busy', 'true');
  mockList.mockReturnValue({
    ...pending,
    status: 'succeeded',
    hasAny: true,
    totals: { members: 1, dues: '300.00', depositsHeld: '0.00' },
  });
  rerender(<MemberListPageContent />);
  expect(screen.getByTestId('library-members-summary')).toBe(slot);
  expect(slot).toHaveTextContent('1 student · ₹300.00 fee due');
  expect(slot).toHaveAttribute('aria-busy', 'false');
});

/** The approved empty book must still have no summary, search or filters. */
it('removes the reserved summary for a confirmed empty book', () => {
  mockList.mockReturnValue({ ...pending, status: 'succeeded', hasAny: false });
  renderWithProviders(<MemberListPageContent />);
  expect(screen.queryByTestId('library-members-summary')).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
});

it('retains an admission suggestion while the list cleans its URL and seat choices finish loading', async () => {
  // Prevents URL-filter normalization from silently dropping the seat selected on the room map.
  mockParams = new URLSearchParams('add=1&seat=a1&admitShift=morning');
  mockList.mockReturnValue({ ...pending, canWrite: true });
  const view = renderWithProviders(<MemberListPageContent />);
  mockParams = new URLSearchParams();
  mockSeats = {
    activeShifts: [{ id: 'morning' }],
    seats: [{ id: 'a1', isActive: true }],
    listsStatus: 'succeeded',
  };
  view.rerender(<MemberListPageContent />);
  await waitFor(() => expect(screen.getByText('a1:morning')).toBeInTheDocument());
});

it('accepts a new contextual admission when returning to an already visited student list', async () => {
  // Next retains visited route state; a fresh seat action must not reuse a previous blank form.
  mockList.mockReturnValue({ ...pending, canWrite: true });
  mockSeats = {
    activeShifts: [{ id: 'morning' }],
    seats: [{ id: 'a1', isActive: true }],
    listsStatus: 'succeeded',
  };
  const view = renderWithProviders(<MemberListPageContent />);
  mockParams = new URLSearchParams('add=1&seat=a1&admitShift=morning');
  view.rerender(<MemberListPageContent />);
  await waitFor(() => expect(screen.getByText('a1:morning')).toBeInTheDocument());
});

it('opens a student in a drawer and retains the card list when closing it', async () => {
  // Opening a person must not navigate away from the filtered scrolling list.
  const row = {
    membershipId: 'm1',
    name: 'Test Student',
    memberNumber: 'M1',
    feeState: 'paid',
    duesAmount: '0.00',
    seat: null,
    shift: null,
  } as MemberList['rows'][number];
  mockList.mockReturnValue({ ...pending, status: 'succeeded', rows: [row], hasAny: true });
  renderWithProviders(<MemberListPageContent />);
  fireEvent.click(screen.getByRole('button', { name: 'Test Student M1' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Close student m1' })).toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close student m1' }));
  expect(screen.getByRole('button', { name: 'Test Student M1' })).toBeInTheDocument();
});

it('requests the next student page and blocks another request while it is loading', () => {
  // The fallback exercises the same callback as the scrolling sentinel.
  const row = {
    membershipId: 'm1',
    name: 'Test Student',
    memberNumber: 'M1',
    feeState: 'paid',
    duesAmount: '0.00',
    seat: null,
    shift: null,
  } as MemberList['rows'][number];
  const setPage = jest.fn();
  mockList.mockReturnValue({
    ...pending,
    status: 'succeeded',
    rows: [row],
    page: 1,
    totalPages: 2,
    setPage,
  });
  const view = renderWithProviders(<MemberListPageContent />);
  fireEvent.click(screen.getByRole('button', { name: 'Show more students' }));
  expect(setPage).toHaveBeenCalledWith(2);
  mockList.mockReturnValue({
    ...pending,
    status: 'refreshing',
    rows: [row],
    page: 1,
    totalPages: 2,
    filters: { ...MEMBER_FILTER_DEFAULTS, page: '2' },
    setPage,
  });
  view.rerender(<MemberListPageContent />);
  expect(screen.queryByRole('button', { name: 'Show more students' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Test Student M1' })).toBeInTheDocument();
});
