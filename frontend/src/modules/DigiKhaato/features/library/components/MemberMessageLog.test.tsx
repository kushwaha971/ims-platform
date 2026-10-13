import { screen } from '@testing-library/react';

import { resetAllFeatureState } from 'src/redux/actions';
import { store } from 'src/redux/store';
import { en } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/libraryMessageService';

import { MemberMessageLog } from './MemberMessageLog';

/**
 * QA F4 AC3 — "each send appears in the person's log". The log names each
 * message in plain words (never a raw kind code), says when and to whom, shows
 * the words themselves, and reloads when the page says a message was just sent.
 */
/** The real English words, with `{param}` filled in — enough for these strings. */
const translate = (id: string, params?: Record<string, unknown>): string =>
  ((en as Record<string, string>)[id] ?? id).replace(/\{(\w+)\}/g, (_m, key: string) =>
    String(params?.[key] ?? '')
  );

jest.mock('../api/libraryMessageService', () => ({
  ...jest.requireActual('../api/libraryMessageService'),
  listMessageLog: jest.fn(),
}));

beforeEach(() => {
  store.dispatch(resetAllFeatureState());
  jest.clearAllMocks();
});

describe('MemberMessageLog', () => {
  it('lists what was sent, in plain words, with the text', async () => {
    jest.mocked(service.listMessageLog).mockResolvedValue([
      {
        id: 'r2',
        kind: 'custom',
        sentAt: '2026-10-12T10:05:00+05:30',
        to: 'Meena',
        text: 'Closed Sunday',
      },
      { id: 'r1', kind: 'plan_end', sentAt: '2026-10-11T09:00:00+05:30', to: 'Asha', text: '' },
      { id: 'r0', kind: 'message', sentAt: null, to: 'Asha', text: '' },
    ]);
    renderWithProviders(<MemberMessageLog membershipId="m1" refreshKey={0} t={translate} />);
    expect(await screen.findByText('Your own message')).toBeInTheDocument();
    expect(screen.getByText('Plan end date')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.getByText('Closed Sunday')).toBeInTheDocument();
    expect(screen.getByText(/to Meena/)).toBeInTheDocument();
    expect(screen.queryByText(/plan_end|custom/)).not.toBeInTheDocument();
  });

  it('says nothing was sent, and reloads after a send', async () => {
    jest.mocked(service.listMessageLog).mockResolvedValue([]);
    const { rerender } = renderWithProviders(
      <MemberMessageLog membershipId="m1" refreshKey={0} t={translate} />
    );
    expect(await screen.findByText('No message sent yet.')).toBeInTheDocument();
    rerender(<MemberMessageLog membershipId="m1" refreshKey={1} t={translate} />);
    await screen.findByText('No message sent yet.');
    expect(service.listMessageLog).toHaveBeenCalledTimes(2);
  });
});
