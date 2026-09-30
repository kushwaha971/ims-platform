import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { store } from 'src/redux/store';
import { ALL_MESSAGES } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { resetPartyList } from '../redux/partyListSlice';
import { resetPartyTags } from '../redux/partyTagSlice';

import { PartyListPageContent } from './PartyListPageContent';

/**
 * A6 (PLT-X04 §2 flow 1, T-PLT-X04-8's unit half) — the "Role" chips. The
 * assertion is on the REQUEST, not on the chip: PTY-02 shipped chips that lit
 * up and issued nothing, so a chip here is proved by the `role=` it sends.
 */
jest.mock('../api/partyService');
jest.mock('../api/partyRelationService');
jest.mock('../api/tagService');

let mockSearch = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
  usePathname: () => '/parties',
}));

const partyService = jest.requireMock('../api/partyService') as {
  listParties: jest.Mock;
};
const relationService = jest.requireMock('../api/partyRelationService') as {
  listPartyRoles: jest.Mock;
};
const tagService = jest.requireMock('../api/tagService') as { listTags: jest.Mock };

// The vertical ships its role word; the test stands in for that catalogue line.
const MESSAGES = {
  ...ALL_MESSAGES.en,
  'gym.role.members': '{count, plural, one {Member} other {Members}}',
};

const RAHUL = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Rahul',
  displayCode: null,
  mobile: null,
  isCustomer: true,
  isSupplier: false,
  balance: '0.00',
  status: 'active' as const,
  lastActivityAt: null,
  tags: [],
  roles: ['gym_member'],
};

const page = (rows: readonly unknown[], rolesOn: boolean) => ({
  rows,
  meta: { page: 1, pageSize: 25, total: rows.length, totalPages: 1 },
  totals: null,
  rolesOn,
});

const ROLES = [
  { code: 'gym_member', module: 'gym', labelId: 'gym.role.members', count: 1 },
  { code: 'lending_borrower', module: 'lending', labelId: 'lending.role.borrowers', count: 0 },
];

beforeEach(() => {
  store.dispatch(resetPartyList());
  store.dispatch(resetPartyTags());
  jest.clearAllMocks();
  mockSearch = '';
  tagService.listTags.mockResolvedValue([]);
  relationService.listPartyRoles.mockResolvedValue(ROLES);
});

describe('Role chips', () => {
  it('are absent, and never asked for, without a module that has roles', async () => {
    partyService.listParties.mockResolvedValue(page([{ ...RAHUL, roles: undefined }], false));

    renderWithProviders(<PartyListPageContent />, { messages: MESSAGES });

    expect(await screen.findByText('Rahul')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Role' })).not.toBeInTheDocument();
    expect(relationService.listPartyRoles).not.toHaveBeenCalled();
  });

  it("use the module's word and filter the list by role, on the wire", async () => {
    partyService.listParties.mockResolvedValue(page([RAHUL], true));
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />, { messages: MESSAGES });

    const members = await screen.findByRole('button', { name: 'Members' });
    // A role whose catalogue is not loaded here falls back to a whole word, never an id.
    expect(screen.getByRole('button', { name: 'Role' })).toBeInTheDocument();
    expect(screen.queryByText('lending.role.borrowers')).not.toBeInTheDocument();

    await user.click(members);

    await waitFor(() =>
      expect(partyService.listParties).toHaveBeenLastCalledWith(
        expect.objectContaining({ role: 'gym_member' }),
        expect.anything()
      )
    );
    expect(screen.getByRole('button', { name: 'Members' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keep a pressed chip even when the filtered list is empty', async () => {
    /* The credit-chip lesson: a filter that matched nobody must not take away
       the control that applied it. */
    mockSearch = 'role=gym_member';
    partyService.listParties.mockResolvedValue(page([], false));

    renderWithProviders(<PartyListPageContent />, { messages: MESSAGES });

    const members = await screen.findByRole('button', { name: 'Members' });
    expect(members).toHaveAttribute('aria-pressed', 'true');
    expect(partyService.listParties).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'gym_member' }),
      expect.anything()
    );
  });

  it('drop a role the server refuses and load the list without it', async () => {
    /* EC-2 — the module was switched off after the link was shared: the server
       answers 400 {role: [...]} for the whole list, and a merchant opening the
       link must get their book, not an error screen. */
    mockSearch = 'role=gym_member';
    partyService.listParties.mockImplementation(async (params: { role?: string }) => {
      if (params.role) {
        throw {
          code: 'validation_error',
          message: 'Please check the highlighted fields.',
          details: { role: ['Unknown role.'] },
          requestId: 'req_1',
          status: 400,
          warnings: [],
        };
      }
      return page([{ ...RAHUL, roles: undefined }], false);
    });

    renderWithProviders(<PartyListPageContent />, { messages: MESSAGES });

    expect(await screen.findByText('Rahul')).toBeInTheDocument();
    expect(store.getState().partyList.filters.role).toBe('');
  });

  it('ignore a role in the URL that is not a code at all', async () => {
    mockSearch = 'role=Gym Member,<b>';
    partyService.listParties.mockResolvedValue(page([], false));

    renderWithProviders(<PartyListPageContent />, { messages: MESSAGES });

    await waitFor(() => expect(partyService.listParties).toHaveBeenCalled());
    expect(partyService.listParties.mock.calls.every(([params]) => !params.role)).toBe(true);
  });
});
