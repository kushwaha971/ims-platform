import { screen } from '@testing-library/react';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { MEMBER_FILTER_DEFAULTS } from '../constants/memberConstants';
import { useMemberList, type MemberList } from '../hooks/useMemberList';

import { MemberListPageContent } from './MemberListPageContent';

jest.mock('../hooks/useMemberList');
jest.mock('../hooks/useSeats', () => ({ useSeats: () => ({ activeShifts: [] }) }));
jest.mock('../api/libraryMemberService', () => ({ listMembershipTypes: jest.fn(async () => []) }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
