import type * as ReactModule from 'react';

import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { bulkClosed, resetReminders } from '../redux/reminderSlice';

import { RemindersPageContent } from './RemindersPageContent';

import type { DueParty, Reminder } from '../types/reminder.types';

/**
 * LED-05/06/07 on screen: content → hook → thunk → service, the service
 * stubbed at the module boundary (§19.13.3). What these protect is the
 * merchant's side: the tab counts are the server's, the bulk flow is one real
 * link per customer (never a loop of `window.open` the popup blocker eats), a
 * skipped step is recorded as dismissed, and the controls that write are
 * absent for a role that cannot.
 */
jest.mock('../api/reminderService');

/* The first render of this screen mounts the grid, the tabs and the lazy slice
   for the first time in the file; on a loaded CI box that alone can pass the
   default five seconds. The assertions are about behaviour, not speed. */
jest.setTimeout(20_000);

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockSearch = '';
const mockUrlListeners = new Set<() => void>();
jest.mock('next/navigation', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof ReactModule>('react');
  const subscribe = (listener: () => void) => {
    mockUrlListeners.add(listener);
    return () => {
      mockUrlListeners.delete(listener);
    };
  };
  const read = () => mockSearch;
  return {
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: jest.fn(),
      prefetch: jest.fn(),
    }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, read, read)),
    usePathname: () => '/ledger/reminders',
  };
});

const service = jest.requireMock('../api/reminderService') as {
  getCollectionSummary: jest.Mock;
  listDueParties: jest.Mock;
  listReminders: jest.Mock;
  getReminderSettings: jest.Mock;
  updateReminderSettings: jest.Mock;
  bulkReminders: jest.Mock;
  sendReminder: jest.Mock;
  markReminder: jest.Mock;
  previewReminder: jest.Mock;
  createReminder: jest.Mock;
};

const RAMESH: DueParty = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ramesh Traders',
  mobile: '+919876543210',
  balance: '3000.00',
  collectionDate: '2026-09-24',
};
const SUNITA: DueParty = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Sunita Kirana',
  mobile: '+919812345678',
  balance: '200.00',
  collectionDate: '2026-09-24',
};

const FAILED_ROW: Reminder = {
  id: 'r9',
  partyId: RAMESH.id,
  partyName: 'Ramesh Traders',
  dueOn: '2026-09-24',
  channel: 'sms',
  kind: 'auto_d0',
  status: 'failed',
  snapshotBalance: '3000.00',
  note: 'provider not configured',
  sentAt: null,
  createdAt: '2026-09-24T03:30:00Z',
};

const OWNER: readonly PermissionCode[] = [
  'parties.party.read',
  'ledger.entry.read',
  'ledger.reminder.write',
  'notifications.settings.manage',
];

const signIn = (permissions: readonly PermissionCode[] = OWNER): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@shop.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: ['parties', 'ledger'],
      version: 1,
    })
  );
};

/** A desktop, so the grid is a table with its Remind buttons and selection. */
const desktop = (): void => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: true,
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

const setUrl = (search: string): void => {
  mockSearch = search;
  act(() => mockUrlListeners.forEach((l) => l()));
};

/* jsdom cannot navigate; the browser would follow the link after the click. */
const swallowNavigation = (event: MouseEvent) => {
  if ((event.target as Element | null)?.closest('a')) event.preventDefault();
};

beforeAll(async () => {
  // The dialogs are `dynamic()`; pay their first transform outside any test.
  await Promise.all([
    import('./BulkReminderDialog'),
    import('./ReminderSettingsDialog'),
    import('./PartyReminderSheet'),
  ]);
}, 30_000);

beforeEach(() => {
  jest.clearAllMocks();
  store.dispatch(resetReminders());
  store.dispatch(bulkClosed());
  mockSearch = '';
  mockReplace.mockImplementation((url: string) => setUrl(url.replace(/^\?/, '')));
  desktop();
  document.addEventListener('click', swallowNavigation);
  service.getCollectionSummary.mockResolvedValue({
    dueToday: { count: 2, amount: '3200.00' },
    overdue: { count: 5, amount: '900.00' },
    upcoming: { count: 1, amount: '50.00' },
    asOf: '2026-09-24',
  });
  service.listDueParties.mockImplementation(
    async (bucket: string, page: number, pageSize: number) => ({
      rows: bucket === 'today' ? [RAMESH, SUNITA] : [],
      page,
      pageSize,
      total: bucket === 'today' ? 2 : 0,
    })
  );
  service.listReminders.mockResolvedValue({
    rows: [FAILED_ROW],
    page: 1,
    pageSize: 25,
    total: 1,
    totals: { sent: 0, failed: 1, lastSentAt: null, lastChannel: null },
  });
  service.getReminderSettings.mockResolvedValue({
    autoSms: false,
    partySmsOnEntry: false,
    smsConfigured: false,
  });
  service.bulkReminders.mockResolvedValue({
    items: [RAMESH, SUNITA].map((p, i) => ({
      partyId: p.id,
      partyName: p.name,
      reminderId: `b${i + 1}`,
      balance: p.balance,
      text: `Namaste ${p.name} ji`,
      waUrl: `https://wa.me/91${i}?text=hi`,
      smsUrl: `sms:+91${i}?&body=hi`,
    })),
    skipped: [{ partyId: 'x', reason: 'no_mobile' }],
  });
  service.sendReminder.mockResolvedValue(undefined);
  service.markReminder.mockImplementation(async (id: string, status: string) => ({
    ...FAILED_ROW,
    id,
    status,
  }));
  signIn();
});

afterEach(() => document.removeEventListener('click', swallowNavigation));

describe('the reminders screen (LED-05)', () => {
  it('puts the server’s bucket counts on the tabs and lists today’s customers', async () => {
    /* Prevents: AC-2 — a tab reading one number over a list of another. The
       counts are the summary's; the rows are `GET /reminders/due`. */
    renderWithProviders(<RemindersPageContent />);

    const tabs = await screen.findByRole('tablist', { name: 'Reminder lists' });
    await waitFor(() =>
      expect(within(tabs).getByRole('tab', { name: /Overdue\s*5/ })).toBeInTheDocument()
    );
    expect(within(tabs).getByRole('tab', { name: /Due today\s*2/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    /* QA: "Sent" clipped at 390 px. A phone shows the short word, but it is
       aria-hidden — the tab's name stays the full label at every width. */
    const sent = within(tabs).getByRole('tab', { name: 'Sent' });
    expect(within(sent).getByText('Sent', { selector: '[aria-hidden="true"]' })).toHaveClass(
      'sm:hidden'
    );
    expect(within(tabs).getByRole('tab', { name: /^Upcoming/ })).toHaveTextContent('Next');
    expect(await screen.findByText('Ramesh Traders')).toBeInTheDocument();
    expect(screen.getByTestId('bucket-caption')).toHaveTextContent('₹3,200.00 from 2 customers');
    expect(service.listDueParties).toHaveBeenCalledWith('today', 1, 25, expect.anything());
  });

  it('moves between buckets through the address bar', async () => {
    /* Prevents: the inbox's "/ledger/reminders?bucket=today" link and a tab
       tap disagreeing about which list is showing. */
    const user = userEvent.setup();
    renderWithProviders(<RemindersPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('tab', { name: /Overdue/ }));
    expect(mockReplace).toHaveBeenCalledWith('?bucket=overdue', { scroll: false });
    await waitFor(() =>
      expect(service.listDueParties).toHaveBeenCalledWith('overdue', 1, 25, expect.anything())
    );
    expect(await screen.findByText('Nothing overdue')).toBeInTheDocument();
  });
});

describe('Remind all (LED-06 FR-7)', () => {
  it('walks the customers one real link at a time, and never calls window.open', async () => {
    /* Prevents: a loop of window.open — the browser allows one popup per tap
       and silently eats the rest — and a bulk run that marks customers "sent"
       before the merchant tapped anything. */
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    renderWithProviders(<RemindersPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('button', { name: 'Remind all on this page' }));
    expect(service.bulkReminders).toHaveBeenCalledWith([RAMESH.id, SUNITA.id], 'whatsapp_manual');
    const dialog = await screen.findByRole('dialog', { name: 'Remind customers' });
    expect(service.sendReminder).not.toHaveBeenCalled();

    const first = await within(dialog).findByRole('link', { name: 'WhatsApp Ramesh Traders' });
    expect(first).toHaveAttribute('href', 'https://wa.me/910?text=hi');
    expect(first).toHaveAttribute('target', '_blank');
    await user.click(first);
    await waitFor(() => expect(service.sendReminder).toHaveBeenCalledWith('b1'));

    // The next customer is the next tap; Skip records a dismissal.
    await within(dialog).findByRole('link', { name: 'WhatsApp Sunita Kirana' });
    await user.click(within(dialog).getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(service.markReminder).toHaveBeenCalledWith('b2', 'dismissed'));

    expect(
      await within(dialog).findByText('WhatsApp opened for 1 · skipped 1')
    ).toBeInTheDocument();
    expect(within(dialog).getByText('1 has no mobile number')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

describe('who sees what', () => {
  it('shows an accountant the lists and no control that writes', async () => {
    /* Prevents: §12 — Remind, Remind all and the settings gear for a role
       without `ledger.reminder.write` / `notifications.settings.manage`. */
    signIn(['parties.party.read', 'ledger.entry.read']);
    renderWithProviders(<RemindersPageContent />);
    await screen.findByText('Ramesh Traders');

    expect(screen.queryByRole('button', { name: 'Remind Ramesh Traders' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remind all on this page' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reminder settings' })).not.toBeInTheDocument();
  });

  it('says plainly when automated SMS is on and nothing can leave', async () => {
    /* Prevents: LED-07 — a merchant who switched automated SMS on believing
       customers are being texted when no provider exists. */
    service.getReminderSettings.mockResolvedValue({
      autoSms: true,
      partySmsOnEntry: false,
      smsConfigured: false,
    });
    renderWithProviders(<RemindersPageContent />);
    expect(await screen.findByText("Automated SMS can't be sent yet")).toBeInTheDocument();
  });

  it('opens the two switches for the owner, and saves one on flip', async () => {
    const user = userEvent.setup();
    service.updateReminderSettings.mockResolvedValue({
      autoSms: true,
      partySmsOnEntry: false,
      smsConfigured: false,
    });
    renderWithProviders(<RemindersPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('button', { name: 'Reminder settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reminder settings' });
    expect(within(dialog).getByText('No SMS provider is set up yet')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('switch', { name: /Automated SMS reminders/ }));
    await waitFor(() =>
      expect(service.updateReminderSettings).toHaveBeenCalledWith({ autoSms: true })
    );
  });
});

describe('the Sent tab', () => {
  it('shows what failed and why, in the merchant’s language, and filters to failures', async () => {
    /* Prevents: LED-07 FR-3 — a failed automated SMS that looks sent, and the
       server's English note "provider not configured" shown untranslated. */
    const user = userEvent.setup();
    mockSearch = 'bucket=sent';
    renderWithProviders(<RemindersPageContent />);

    expect(await screen.findByText(/no SMS provider set up/)).toBeInTheDocument();
    // The badge, beside the filter chip of the same word.
    expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole('radio', { name: 'Failed' }));
    await waitFor(() =>
      expect(service.listReminders).toHaveBeenLastCalledWith(
        { kind: undefined, status: 'failed', page: 1, pageSize: 25 },
        expect.anything()
      )
    );
  });
});
