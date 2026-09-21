import { screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { AcceptInvitePageContent } from './AcceptInvitePageContent';

jest.mock('../api/invitationService');
const service = jest.requireMock('../api/invitationService');

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  ...jest.requireActual('next/navigation'),
  useRouter: () => ({ replace, push: jest.fn(), refresh: jest.fn() }),
}));

describe('AcceptInvitePageContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.acceptInvitation = jest.fn().mockResolvedValue(undefined);
  });

  it('accepts exactly once, however many times the effect runs', async () => {
    /**
     * The defect this pins, measured against a live server before it was fixed:
     * React's development double-invoke ran the effect twice, so the component
     * sent two real POSTs. The first returned 200 and created the membership;
     * the second returned 400 `invitation_invalid`, because the token was now
     * spent — and the second is the one that landed, so someone who HAD just
     * joined was told the invitation could not be used.
     *
     * Accepting is not idempotent, so this is not only a development concern: any
     * double-fire spends the link and reports failure.
     */
    const { rerender } = renderWithProviders(<AcceptInvitePageContent token="tok-1" />);
    rerender(<AcceptInvitePageContent token="tok-1" />);
    rerender(<AcceptInvitePageContent token="tok-1" />);

    await waitFor(() => expect(service.acceptInvitation).toHaveBeenCalledTimes(1));
    expect(service.acceptInvitation).toHaveBeenCalledWith('tok-1');
  });

  it('says so when the invitee has joined', async () => {
    renderWithProviders(<AcceptInvitePageContent token="tok-2" />);

    expect(await screen.findByText(/you have joined/i)).toBeInTheDocument();
  });

  it('does not sit on "joining" forever when the guard and the effect disagree', async () => {
    /**
     * The bug the first fix introduced, which was worse than the one it cured. A
     * `cancelled` flag plus the once-per-token ref meant React cleaned up the
     * FIRST run (setting the flag) and the ref skipped the SECOND — so neither
     * ever set a result and the screen stayed on "Joining this business…"
     * indefinitely. Measured that way too.
     */
    const { rerender } = renderWithProviders(<AcceptInvitePageContent token="tok-3" />);
    rerender(<AcceptInvitePageContent token="tok-3" />);

    await waitFor(() =>
      expect(screen.queryByText(/joining this business/i)).not.toBeInTheDocument()
    );
    expect(screen.getByText(/you have joined/i)).toBeInTheDocument();
  });

  it('explains a spent link in place rather than in a toast', async () => {
    // Every reason this fails — expired, revoked, already used, addressed to
    // someone else — is one a retry cannot change, so the message has to stay on
    // screen long enough to read and the only action offered is the one that works.
    service.acceptInvitation = jest.fn().mockRejectedValue({
      response: { status: 400, data: { error: { code: 'invitation_invalid', message: 'This invitation is not valid.' } } },
    });

    renderWithProviders(<AcceptInvitePageContent token="tok-4" />);

    expect(await screen.findByText(/cannot be used/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again|retry/i })).not.toBeInTheDocument();
  });
});
