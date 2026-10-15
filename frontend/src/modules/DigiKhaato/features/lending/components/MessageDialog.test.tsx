import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import { todayInTenantTz } from 'src/utils/dates';

import * as service from '../api/lendingMessageService';
import { nextDay } from '../view-model/lendingDisplay';

import { MessageDialog } from './MessageDialog';

import type { PreparedLendingMessage } from '../types/lending.types';

/**
 * L03 (LEN-12) — a borrower's message: the fixed text, read-only, with the
 * links ready before the tap (a window opened after a request returns is a
 * blocked pop-up), and the tap recorded with the channel used. When the
 * policy says no — out of hours, or already reminded today — there is no
 * button to press, and the sheet says why AND when (§8).
 */
jest.mock('../api/lendingMessageService', () => ({
  ...jest.requireActual('../api/lendingMessageService'),
  prepareMessage: jest.fn(),
  recordMessage: jest.fn(),
}));

const prepared = (over: Partial<PreparedLendingMessage> = {}): PreparedLendingMessage => ({
  kind: 'reminder',
  bucket: 'overdue',
  text: 'Namaste Geeta Devi. Verma Finance here. Our records show Rs 2,000 due on loan LN-0001.',
  waUrl: 'https://wa.me/919820011223?text=Namaste',
  smsUrl: 'sms:+919820011223?body=Verma',
  telUrl: 'tel:+919820011223',
  recipient: { name: 'Geeta Devi', hasMobile: true },
  allowed: true,
  refusal: null,
  lastToday: null,
  changesInSeconds: 3600,
  ...over,
});

beforeEach(() => {
  store.dispatch(resetAllFeatureState());
  jest.clearAllMocks();
});

const open = () =>
  renderWithProviders(
    <MessageDialog loanId="l1" name="Geeta Devi" kind="reminder" onClose={jest.fn()} />
  );

describe('MessageDialog (lending)', () => {
  it('shows the fixed text and its bucket, and records the WhatsApp tap', async () => {
    jest.mocked(service.prepareMessage).mockResolvedValue(prepared());
    jest.mocked(service.recordMessage).mockResolvedValue(undefined);
    open();
    expect(await screen.findByTestId('lending-message-text')).toHaveValue(prepared().text);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled();
    const send = screen.getByTestId('lending-message-whatsapp');
    expect(send).toHaveAttribute('href', 'https://wa.me/919820011223?text=Namaste');
    send.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(send);
    expect(service.recordMessage).toHaveBeenCalledWith(
      'l1',
      'reminder',
      'whatsapp_manual',
      undefined
    );
  });

  it('records SMS and Call as their own channels', async () => {
    jest.mocked(service.prepareMessage).mockResolvedValue(prepared());
    jest.mocked(service.recordMessage).mockResolvedValue(undefined);
    open();
    const call = await screen.findByRole('link', { name: 'Call' });
    expect(call).toHaveAttribute('href', 'tel:+919820011223');
    call.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(call);
    expect(service.recordMessage).toHaveBeenCalledWith('l1', 'reminder', 'call', undefined);
  });

  it('says when messages can go, out of hours, and offers nothing to press', async () => {
    const tomorrow = nextDay(todayInTenantTz());
    jest.mocked(service.prepareMessage).mockResolvedValue(
      prepared({
        allowed: false,
        refusal: {
          code: 'reminder_outside_window',
          message: 'Reminders for this can be sent between 08:00 and 19:00.',
          nextAllowedAt: `${tomorrow}T08:00:00+05:30`,
          windowStart: '08:00',
          windowEnd: '19:00',
        },
      })
    );
    open();
    expect(await screen.findByTestId('lending-message-guard')).toHaveTextContent(
      'Messages to borrowers go between 08:00 and 19:00. Next: tomorrow at 08:00.'
    );
    expect(screen.queryByTestId('lending-message-whatsapp')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Call' })).not.toBeInTheDocument();
  });

  it('says when the loan was already reminded today', async () => {
    const today = todayInTenantTz();
    jest.mocked(service.prepareMessage).mockResolvedValue(
      prepared({
        allowed: false,
        refusal: {
          code: 'reminder_cap_reached',
          message: 'The daily limit of 1 is used.',
          nextAllowedAt: `${nextDay(today)}T08:00:00+05:30`,
          windowStart: null,
          windowEnd: null,
        },
        lastToday: { at: `${today}T10:14:00+05:30`, channel: 'whatsapp_manual' },
      })
    );
    open();
    expect(await screen.findByTestId('lending-message-guard')).toHaveTextContent(
      'Already reminded today at 10:14. Next: tomorrow at 08:00.'
    );
  });

  it('says a refusal from the server, with no button', async () => {
    jest.mocked(service.prepareMessage).mockRejectedValue({
      code: 'lending_nothing_due',
      message: 'Nothing is due on this loan today or tomorrow.',
      details: {},
      requestId: null,
      status: 409,
      warnings: [],
    });
    open();
    expect(
      await screen.findByText('Nothing is due on this loan today or tomorrow.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('lending-message-whatsapp')).not.toBeInTheDocument();
  });

  /**
   * L03 follow-up — the link opens WhatsApp on the tap, before the record, so
   * the sheet must not keep offering a tap the server will refuse: it asks
   * again when the server said its answer changes, and the buttons go.
   */
  it('turns itself off when the server said the answer changes', async () => {
    jest.useFakeTimers();
    try {
      jest
        .mocked(service.prepareMessage)
        .mockResolvedValueOnce(prepared({ changesInSeconds: 60 }))
        .mockResolvedValueOnce(
          prepared({
            allowed: false,
            changesInSeconds: 46800,
            refusal: {
              code: 'reminder_outside_window',
              message: 'Reminders for this can be sent between 08:00 and 19:00.',
              nextAllowedAt: `${nextDay(todayInTenantTz())}T08:00:00+05:30`,
              windowStart: '08:00',
              windowEnd: '19:00',
            },
          })
        );
      open();
      expect(await screen.findByTestId('lending-message-whatsapp')).toBeInTheDocument();
      await act(async () => {
        jest.advanceTimersByTime(61_000);
      });
      expect(await screen.findByTestId('lending-message-guard')).toHaveTextContent(
        'Next: tomorrow at 08:00.'
      );
      expect(screen.queryByTestId('lending-message-whatsapp')).not.toBeInTheDocument();
      expect(service.prepareMessage).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('asks again when the phone comes back to the app', async () => {
    jest.mocked(service.prepareMessage).mockResolvedValue(prepared());
    open();
    await screen.findByTestId('lending-message-whatsapp');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await screen.findByTestId('lending-message-whatsapp');
    expect(service.prepareMessage).toHaveBeenCalledTimes(2);
  });
});

it('previews and records edited receipt text, and restores the default', async () => {
  jest
    .mocked(service.prepareMessage)
    .mockImplementation(async (_id, _kind, _collection, _signal, text) =>
      prepared({
        text: text ?? 'Receipt default',
        waUrl: 'https://wa.me/919820011223?text=' + encodeURIComponent(text ?? 'Receipt default'),
      })
    );
  jest.mocked(service.recordMessage).mockResolvedValue(undefined);
  renderWithProviders(
    <MessageDialog
      loanId="l1"
      name="Geeta Devi"
      kind="receipt"
      collectionId="c1"
      onClose={jest.fn()}
    />
  );
  const field = await screen.findByRole('textbox', { name: 'Message' });
  await userEvent.clear(field);
  await userEvent.type(field, 'Thank you, payment received.');
  await waitFor(() =>
    expect(screen.getByTestId('lending-message-whatsapp')).toHaveAttribute(
      'href',
      'https://wa.me/919820011223?text=Thank%20you%2C%20payment%20received.'
    )
  );
  const send = screen.getByTestId('lending-message-whatsapp');
  send.addEventListener('click', (event) => event.preventDefault());
  await userEvent.click(send);
  await waitFor(() =>
    expect(service.recordMessage).toHaveBeenCalledWith(
      'l1',
      'receipt',
      'whatsapp_manual',
      'c1',
      'Thank you, payment received.'
    )
  );
  await userEvent.click(screen.getByRole('button', { name: 'Restore default message' }));
  await waitFor(() => expect(field).toHaveValue('Receipt default'));
});
