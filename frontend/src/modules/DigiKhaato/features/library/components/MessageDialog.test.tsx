import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/libraryMessageService';

import { MessageDialog } from './MessageDialog';

/**
 * W06 — a WhatsApp message handled like a reminder: the text and the link are
 * ready before the tap (a window opened after a request returns is a blocked
 * pop-up), and the tap records it. A refusal ("nothing is due") is said in
 * the dialog with no button to press.
 */
jest.mock('../api/libraryMessageService', () => ({
  ...jest.requireActual('../api/libraryMessageService'),
  prepareMessage: jest.fn(),
  recordMessage: jest.fn(),
}));

beforeEach(() => {
  store.dispatch(resetAllFeatureState());
  jest.clearAllMocks();
});

describe('MessageDialog', () => {
  it('shows the prepared text, links to WhatsApp and records the tap', async () => {
    jest.mocked(service.prepareMessage).mockResolvedValue({
      kind: 'fee',
      text: 'Hello Rahul, your Monthly plan ends on 06/10/2026.',
      waUrl: 'https://wa.me/919123456780?text=Hello',
      recipient: { name: 'Rahul Sharma', isGuardian: false, hasMobile: true },
    });
    jest.mocked(service.recordMessage).mockResolvedValue(undefined);
    renderWithProviders(
      <MessageDialog membershipId="m1" name="Rahul Sharma" kind="fee" onClose={jest.fn()} />
    );
    expect(await screen.findByText(/your Monthly plan ends/)).toBeInTheDocument();
    const send = screen.getByTestId('library-message-send');
    expect(send).toHaveAttribute('href', 'https://wa.me/919123456780?text=Hello');
    send.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(send);
    expect(service.recordMessage).toHaveBeenCalledWith('m1', 'fee');
  });

  it('says why nothing can be sent, and offers no button', async () => {
    jest.mocked(service.prepareMessage).mockRejectedValue({
      code: 'unknown',
      message: 'Nothing is due.',
      details: {},
      requestId: null,
      status: 409,
      warnings: [],
    });
    renderWithProviders(
      <MessageDialog membershipId="m1" name="Asha" kind="fee" onClose={jest.fn()} />
    );
    expect(await screen.findByText('Nothing is due.')).toBeInTheDocument();
    expect(screen.queryByTestId('library-message-send')).not.toBeInTheDocument();
  });
});
