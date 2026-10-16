import { fireEvent, screen } from '@testing-library/react';
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
    expect(await screen.findByDisplayValue(/your Monthly plan ends/)).toBeInTheDocument();
    const send = screen.getByTestId('library-message-send');
    expect(send).toHaveAttribute('href', 'https://wa.me/919123456780?text=Hello');
    send.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(send);
    expect(service.recordMessage).toHaveBeenCalledWith(
      'm1',
      'fee',
      undefined,
      'Hello Rahul, your Monthly plan ends on 06/10/2026.'
    );
  });

  it('lets the desk change the prepared words, links and records exactly them', async () => {
    /* Prevents: WP-04 M-08 — a fee or receipt message the desk could read but
       not correct before WhatsApp opened, and a log of words never sent. */
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
    const box = await screen.findByRole('textbox', { name: 'Message' });
    fireEvent.change(box, { target: { value: 'Rahul ji, plan 6 Oct ko khatam 🙏' } });
    const send = screen.getByTestId('library-message-send');
    const href = send.getAttribute('href') ?? '';
    expect(href.startsWith('https://wa.me/919123456780?text=')).toBe(true);
    expect(new URL(href).searchParams.get('text')).toBe('Rahul ji, plan 6 Oct ko khatam 🙏');
    send.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(send);
    expect(service.recordMessage).toHaveBeenCalledWith(
      'm1',
      'fee',
      undefined,
      'Rahul ji, plan 6 Oct ko khatam 🙏'
    );

    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Write a message before sending.');
    expect(screen.queryByTestId('library-message-send')).not.toBeInTheDocument();
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

  it('asks for the words of a custom message first, then sends exactly those words', async () => {
    // QA F4 / B51 — nothing is prepared before the desk writes something, the
    // preview is the server's (personalised, signed), and the tap records the
    // same words so the server can build the text again at send time.
    jest.mocked(service.prepareMessage).mockResolvedValue({
      kind: 'custom',
      text: 'Hi Asha, closed on Sunday.\n— Reading Room',
      waUrl: 'https://wa.me/919123456780?text=Hi',
      recipient: { name: 'Asha', isGuardian: false, hasMobile: true },
    });
    jest.mocked(service.recordMessage).mockResolvedValue(undefined);
    renderWithProviders(
      <MessageDialog membershipId="m1" name="Asha" kind="custom" onClose={jest.fn()} />
    );
    expect(service.prepareMessage).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole('textbox'), 'Hi {{name}, closed on Sunday.');
    await userEvent.click(screen.getByTestId('library-message-prepare'));
    expect(await screen.findByText(/Hi Asha, closed on Sunday\./)).toBeInTheDocument();
    expect(service.prepareMessage).toHaveBeenCalledWith(
      'm1',
      'custom',
      expect.anything(),
      'Hi {name}, closed on Sunday.'
    );
    const send = screen.getByTestId('library-message-send');
    send.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(send);
    expect(service.recordMessage).toHaveBeenCalledWith(
      'm1',
      'custom',
      'Hi {name}, closed on Sunday.',
      'Hi Asha, closed on Sunday.\n— Reading Room'
    );
  });

  it('refuses an empty custom message without asking the server', async () => {
    renderWithProviders(
      <MessageDialog membershipId="m1" name="Asha" kind="custom" onClose={jest.fn()} />
    );
    await userEvent.click(screen.getByTestId('library-message-prepare'));
    expect(await screen.findByText('Write the message')).toBeInTheDocument();
    expect(service.prepareMessage).not.toHaveBeenCalled();
  });
});
