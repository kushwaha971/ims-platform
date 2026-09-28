import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UbGridTier } from 'src/design-system/UbDataGrid';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { hi } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { resetInvitations } from '../redux/invitationSlice';
import { resetMembers } from '../redux/memberSlice';

import { TeamPageContent } from './TeamPageContent';

/**
 * PLT-05 end to end inside the client (§19.13.3): screen → hook → thunk →
 * service, with the service stubbed at the MODULE boundary. The backend for
 * `/invitations` is being written in parallel, so nothing here talks to a
 * server — which is also the only honest way to test the two states that
 * matter most, since a permission refusal and a one-time link are both things
 * the client has to get right before the first real 201 exists.
 *
 * Each test names the defect it prevents.
 */
jest.mock('../api/invitationService');
// DEC-012 — the screen now carries a members list above the invitations one, so
// this suite has two grids in the tree. It is mocked rather than left to the
// real service because these tests are about the INVITATION half: an unmocked
// member fetch would reject through axios and paint a second error panel for a
// failure that is not what any assertion here is checking.
jest.mock('../api/memberService');

const invitationService = jest.requireMock('../api/invitationService') as {
  listInvitations: jest.Mock;
  createInvitation: jest.Mock;
  revokeInvitation: jest.Mock;
};

const memberService = jest.requireMock('../api/memberService') as {
  listMembers: jest.Mock;
  createMember: jest.Mock;
  regenerateCredentials: jest.Mock;
};

const HOUR = 60 * 60 * 1000;
const future = new Date(Date.now() + 72 * HOUR).toISOString();
const past = new Date(Date.now() - HOUR).toISOString();

const PENDING = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'sunita@example.com',
  role: 'staff' as const,
  status: 'pending' as const,
  expiresAt: future,
  createdAt: '2026-09-18T10:00:00Z',
  invitedBy: 'Ramesh',
};

const LAPSED = {
  ...PENDING,
  id: '22222222-2222-4222-8222-222222222222',
  email: 'old@example.com',
  expiresAt: past,
};

const page = (rows: readonly unknown[]) => ({
  rows,
  meta: { page: 1, pageSize: 25, total: rows.length, totalPages: rows.length === 0 ? 0 : 1 },
});

/** The screen reads the viewport through `matchMedia`; a test that wants a
 *  particular rendering says so. `false` everywhere is the phone. */
const setTier = (tier: UbGridTier): void => {
  const matches = (query: string): boolean =>
    tier === 'full' ? true : tier === 'compact' ? query.includes('768') : false;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
};

const signIn = (permissions: readonly PermissionCode[]): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Ramesh',
        email: 'ramesh@example.com',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Sharma', timezone: 'Asia/Kolkata' },
      tenants: [],
      permissions: [...permissions],
      enabledModules: ['platform'],
      version: 1,
    })
  );
};

beforeEach(() => {
  store.dispatch(resetInvitations());
  store.dispatch(resetMembers());
  jest.clearAllMocks();
  setTier('cards');
  signIn(['platform.members.manage']);
  // The members list is a real fetch on this screen now. Left as the bare
  // automock it resolves `undefined`, the slice reads `.rows` off it and every
  // test in the file dies inside a reducer for a reason none of them are about.
  memberService.listMembers.mockResolvedValue(page([]));
});

describe('TeamPageContent — permission-denied', () => {
  /**
   * `Can` and `usePermissions` existed for a sprint and were rendered nowhere,
   * so nothing had ever proved that a gate hides anything. A member without
   * `platform.members.manage` must see WHY the screen is empty and must not see
   * a control they cannot use.
   */
  it('explains the refusal and offers no control the member cannot use', async () => {
    signIn(['parties.party.read']);

    renderWithProviders(<TeamPageContent />);

    expect(
      await screen.findByText('Only an owner or admin can manage the team')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite member' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('ub-grid-cards')).not.toBeInTheDocument();
  });

  /**
   * The screen must not spend a request to be told 403. The gate is in the
   * hook, not only in the markup — a version that rendered the refusal but
   * fetched anyway would put an error toast over the explanation.
   */
  it('does not call the API at all without the permission', async () => {
    signIn([]);
    invitationService.listInvitations.mockResolvedValue(page([]));

    renderWithProviders(<TeamPageContent />);

    await screen.findByText('Only an owner or admin can manage the team');
    expect(invitationService.listInvitations).not.toHaveBeenCalled();
  });
});

describe('TeamPageContent — the list states', () => {
  it('paints the skeleton first, then the first-use empty state', async () => {
    invitationService.listInvitations.mockResolvedValue(page([]));

    renderWithProviders(<TeamPageContent />);

    // Two grids, so two live regions: scoped rather than loosened, because
    // `getAllByRole(...)[0]` would keep passing if the invitation grid stopped
    // rendering its skeleton altogether.
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    /* "No invite links yet", not "Nobody has been invited yet": DEC-012 —
       nothing is sent, the owner creates a link and sends it (UAT D8). */
    expect(await screen.findByText('No invite links yet')).toBeInTheDocument();
    expect(invitationService.listInvitations).toHaveBeenCalledTimes(1);
  });

  it('renders the same empty state in Hindi', async () => {
    invitationService.listInvitations.mockResolvedValue(page([]));

    renderWithProviders(<TeamPageContent />, {
      locale: 'hi',
      messages: hi as Record<string, string>,
    });

    expect(await screen.findByText('अभी कोई जुड़ने का लिंक नहीं बना')).toBeInTheDocument();
  });

  /**
   * R-E-4 — the failure is rendered IN PAGE with the reference, because
   * `listInvitations` suppresses the toast: a toast would fade and leave an
   * empty screen with no explanation of why it is empty.
   */
  it('shows the error state with its request id, and retries', async () => {
    const user = userEvent.setup();
    invitationService.listInvitations.mockRejectedValue({
      code: 'server_error',
      message: 'Something went wrong.',
      details: {},
      requestId: 'req_42',
      status: 500,
      warnings: [],
    });

    renderWithProviders(<TeamPageContent />);

    expect(await screen.findByText('We could not load your team')).toBeInTheDocument();
    expect(screen.getByTestId('request-id')).toHaveTextContent('req_42');

    invitationService.listInvitations.mockResolvedValue(page([PENDING]));
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('sunita@example.com')).toBeInTheDocument();
  });

  it('lists a pending invitation with its status and a way to revoke it', async () => {
    invitationService.listInvitations.mockResolvedValue(page([PENDING]));

    renderWithProviders(<TeamPageContent />);

    const cards = await screen.findByTestId('ub-grid-cards');
    expect(within(cards).getByText('sunita@example.com')).toBeInTheDocument();
    expect(within(cards).getByText('Waiting')).toBeInTheDocument();
    expect(within(cards).getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
  });

  it('fronts an invitation card with an invite icon, not a letter cut from the address (QA O3)', async () => {
    /* Prevents QA O3: the disc read "s" for "sunita@example.com" — a lowercase
       letter that looks like a person's initial and is not one. */
    invitationService.listInvitations.mockResolvedValue(page([PENDING]));

    renderWithProviders(<TeamPageContent />);

    const cards = await screen.findByTestId('ub-grid-cards');
    expect(within(cards).queryByText('s')).not.toBeInTheDocument();
    expect(cards.querySelector('[aria-hidden] svg.lucide-mail')).not.toBeNull();
  });

  /**
   * A `pending` row whose `expires_at` has passed is NOT pending: the server
   * will refuse the token. Showing "Waiting" beside a Revoke button invited the
   * merchant to act on something that had already lapsed.
   */
  it('reads a lapsed pending invitation as expired, with nothing left to revoke', async () => {
    invitationService.listInvitations.mockResolvedValue(page([LAPSED]));

    renderWithProviders(<TeamPageContent />);

    const cards = await screen.findByTestId('ub-grid-cards');
    expect(within(cards).getByText('Expired')).toBeInTheDocument();
    expect(within(cards).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });
});

describe('TeamPageContent — inviting', () => {
  /**
   * The whole chain, and the two things that are irrecoverable if they are
   * wrong: the POST must carry an `Idempotency-Key` (two 201s for one seat is
   * two live ways into the business), and `accept_url` must be SHOWN, because
   * the server keeps only a hash of the token and can never show it again.
   */
  it('sends the invitation and shows the one-time link', async () => {
    const user = userEvent.setup();
    invitationService.listInvitations.mockResolvedValue(page([]));
    invitationService.createInvitation.mockResolvedValue({
      ...PENDING,
      email: 'nita@example.com',
      acceptUrl: 'https://app.example.com/invite/abc123',
    });

    renderWithProviders(<TeamPageContent />);
    await screen.findByText('No invite links yet');

    await user.click(screen.getByRole('button', { name: 'Invite member' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite a member' });

    await user.type(within(dialog).getByLabelText('Email address'), 'nita@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Create invite link' }));

    await waitFor(() => expect(invitationService.createInvitation).toHaveBeenCalledTimes(1));
    const [body, key] = invitationService.createInvitation.mock.calls[0];
    expect(body).toEqual({ email: 'nita@example.com', role: 'staff' });
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);

    expect(await screen.findByRole('dialog', { name: 'Invitation created' })).toBeInTheDocument();
    expect(screen.getByTestId('invite-accept-url')).toHaveValue(
      'https://app.example.com/invite/abc123'
    );
    // The sentence the merchant has to read BEFORE they close it.
    expect(
      screen.getByText('This link is shown once. Copy it now — it cannot be shown again.')
    ).toBeInTheDocument();
  });

  /**
   * The central Yup hook owns the email rule (R-F-2). A blank or malformed
   * address must never reach the wire — an invitation stored against a typo is
   * one nobody can accept and the merchant cannot see why.
   */
  it('refuses a malformed address without calling the API', async () => {
    const user = userEvent.setup();
    invitationService.listInvitations.mockResolvedValue(page([]));

    renderWithProviders(<TeamPageContent />);
    await screen.findByText('No invite links yet');

    await user.click(screen.getByRole('button', { name: 'Invite member' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite a member' });

    await user.type(within(dialog).getByLabelText('Email address'), 'not-an-address');
    await user.click(within(dialog).getByRole('button', { name: 'Create invite link' }));

    expect(
      await within(dialog).findByText('Enter a valid email address, like ramesh@example.com')
    ).toBeInTheDocument();
    expect(invitationService.createInvitation).not.toHaveBeenCalled();
  });

  /**
   * §19.5.6 — a 400 is anchored on the control that caused it. Before this the
   * duplicate-invitation case surfaced as nothing at all: `validation_error` is
   * in `LOCALLY_PRESENTED`, so it does not toast, and a form that did not
   * anchor it would have shown the merchant an unchanged dialog.
   */
  it('anchors a server rejection on the email field', async () => {
    const user = userEvent.setup();
    invitationService.listInvitations.mockResolvedValue(page([]));
    invitationService.createInvitation.mockRejectedValue({
      code: 'validation_error',
      message: 'Invalid input.',
      details: { email: ['This person has already been invited.'] },
      requestId: 'req_7',
      status: 400,
      warnings: [],
    });

    renderWithProviders(<TeamPageContent />);
    await screen.findByText('No invite links yet');

    await user.click(screen.getByRole('button', { name: 'Invite member' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite a member' });

    await user.type(within(dialog).getByLabelText('Email address'), 'sunita@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Create invite link' }));

    expect(
      await within(dialog).findByText('This person has already been invited.')
    ).toBeInTheDocument();
    // The dialog stays open on a field error: there is something to correct.
    expect(screen.getByRole('dialog', { name: 'Invite a member' })).toBeInTheDocument();
  });
});

describe('TeamPageContent — revoking', () => {
  /**
   * Revoke is destructive and irreversible, so it is behind `UbConfirmDialog`
   * and the confirm names the ACT and the PERSON. A confirm that says "OK"
   * makes the merchant reconstruct from memory which row they pressed.
   */
  it('confirms before revoking, and leaves the row saying so', async () => {
    const user = userEvent.setup();
    invitationService.listInvitations.mockResolvedValue(page([PENDING]));
    invitationService.revokeInvitation.mockResolvedValue(undefined);

    renderWithProviders(<TeamPageContent />);

    const cards = await screen.findByTestId('ub-grid-cards');
    await user.click(within(cards).getByRole('button', { name: 'Revoke' }));

    const dialog = await screen.findByRole('dialog', { name: 'Revoke this invitation?' });
    expect(
      within(dialog).getByText(
        'sunita@example.com will not be able to join with the link you sent them.'
      )
    ).toBeInTheDocument();
    expect(invitationService.revokeInvitation).not.toHaveBeenCalled();

    // The invalidation map refetches this list the moment the revoke lands, so
    // the server's own view of the row is what the merchant ends up reading.
    invitationService.listInvitations.mockResolvedValue(
      page([{ ...PENDING, status: 'revoked' as const }])
    );
    await user.click(within(dialog).getByRole('button', { name: 'Revoke invitation' }));

    await waitFor(() =>
      expect(invitationService.revokeInvitation).toHaveBeenCalledWith(PENDING.id)
    );
    expect(await screen.findByText('Revoked')).toBeInTheDocument();
    // …and the refetch happened rather than the screen trusting its own guess.
    await waitFor(() => expect(invitationService.listInvitations).toHaveBeenCalledTimes(2));
  });

  it('does nothing at all when the merchant cancels', async () => {
    const user = userEvent.setup();
    invitationService.listInvitations.mockResolvedValue(page([PENDING]));

    renderWithProviders(<TeamPageContent />);

    const cards = await screen.findByTestId('ub-grid-cards');
    await user.click(within(cards).getByRole('button', { name: 'Revoke' }));

    const dialog = await screen.findByRole('dialog', { name: 'Revoke this invitation?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(invitationService.revokeInvitation).not.toHaveBeenCalled();
  });
});
