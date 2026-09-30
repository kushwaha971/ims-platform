import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { ALL_MESSAGES, hi } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { registerReminderTab, resetReminderTabsForTests } from '../moduleTabs';
import { resetReminders } from '../redux/reminderSlice';

import { ReminderSettingsDialog } from './ReminderSettingsDialog';
import { RemindersPageContent } from './RemindersPageContent';

import type { ModuleReminderRow } from '../types/reminder.types';

/**
 * A7 (PLT-X06 §2 flows 1-2, §7-§8) — the reminders screen's module tabs, a
 * module record's sheet (the refusal replaces the channels), and the sending
 * hours in Settings. Services are stubbed at the module boundary.
 */
jest.mock('../api/reminderService');
jest.mock('../api/moduleReminderService');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/ledger/reminders',
}));
jest.setTimeout(20_000);

const service = jest.requireMock('../api/reminderService') as Record<
  | 'getCollectionSummary'
  | 'listDueParties'
  | 'listReminders'
  | 'getReminderSettings'
  | 'updateReminderSettings',
  jest.Mock
>;
const moduleService = jest.requireMock('../api/moduleReminderService') as {
  listModuleReminders: jest.Mock;
  previewSourceReminder: jest.Mock;
  sendSourceReminder: jest.Mock;
};

// The vertical ships its tab word; the test stands in for that catalogue line.
const MESSAGES = { ...ALL_MESSAGES.en, 'lending.reminders.tab': 'Loans' };

const DUE: ModuleReminderRow = {
  party: { id: 'p1', name: 'Rahul' },
  recipient: { id: 'p2', name: 'Mohan' },
  sourceType: 'lending_instalment',
  sourceId: 's1',
  subjectLabel: 'Instalment 4 of LN-0042',
  dueOn: '2026-10-12',
  amount: '5625.00',
  bucket: 'due_today',
  allowed: true,
  nextAllowedAt: null,
};
const CAPPED: ModuleReminderRow = {
  ...DUE,
  recipient: null,
  sourceId: 's2',
  subjectLabel: 'Instalment 2 of LN-0051',
  allowed: false,
  nextAllowedAt: '2026-10-13T08:00:00+05:30',
};

const signIn = (
  permissions: readonly PermissionCode[],
  enabledModules: readonly string[] = ['parties', 'ledger', 'lending']
): void => {
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
      activeTenant: { id: 't1', name: 'Verma Lending', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Verma Lending', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: [...enabledModules] as never,
      version: 1,
    })
  );
};

const STAFF: PermissionCode[] = [
  'parties.party.read',
  'ledger.entry.read',
  'ledger.reminder.write',
];

beforeAll(async () => {
  await Promise.all([import('./ModuleRemindersPanel'), import('./SourceReminderSheet')]);
}, 30_000);

beforeEach(() => {
  jest.clearAllMocks();
  resetReminderTabsForTests();
  store.dispatch(resetReminders());
  registerReminderTab('lending', { labelId: 'lending.reminders.tab', order: 10 });
  service.getCollectionSummary.mockResolvedValue({
    dueToday: { count: 0, amount: '0.00' },
    overdue: { count: 0, amount: '0.00' },
    upcoming: { count: 0, amount: '0.00' },
    asOf: '2026-10-12',
  });
  service.listDueParties.mockResolvedValue({ rows: [], page: 1, pageSize: 25, total: 0 });
  service.listReminders.mockResolvedValue({
    rows: [],
    page: 1,
    pageSize: 25,
    total: 0,
    totals: { sent: 0, failed: 0, lastSentAt: null, lastChannel: null },
  });
  service.getReminderSettings.mockResolvedValue({
    autoSms: false,
    partySmsOnEntry: false,
    smsConfigured: false,
  });
  moduleService.listModuleReminders.mockResolvedValue([DUE, CAPPED]);
  moduleService.sendSourceReminder.mockImplementation(
    async (source: { sourceId: string }) => source.sourceId
  );
});

afterEach(() => resetReminderTabsForTests());

describe('Module reminder tabs', () => {
  it('are not drawn for a shop, whose screen is unchanged', async () => {
    signIn(STAFF, ['parties', 'ledger']);
    renderWithProviders(<RemindersPageContent />, { messages: MESSAGES });

    expect(await screen.findByTestId('reminders-screen')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Shop' })).not.toBeInTheDocument();
    expect(moduleService.listModuleReminders).not.toHaveBeenCalled();
  });

  it("list the module's records by bucket, with Remind or the next allowed time", async () => {
    const user = userEvent.setup();
    signIn(STAFF);
    renderWithProviders(<RemindersPageContent />, { messages: MESSAGES });

    await user.click(await screen.findByRole('tab', { name: 'Loans' }));

    expect(await screen.findByText('Instalment 4 of LN-0042')).toBeInTheDocument();
    expect(moduleService.listModuleReminders).toHaveBeenCalledWith('lending', expect.anything());
    expect(screen.getByText('Rahul · to Mohan')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Due today' })).toBeInTheDocument();
    // The capped record says when, and offers no button (§2: never a dead Remind).
    expect(screen.getByText('Next: 13/10/2026, 8:00 am')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remind' })).toHaveLength(1);
  });

  it('send the server text to the recipient and record the tap', async () => {
    const user = userEvent.setup();
    signIn(STAFF);
    moduleService.previewSourceReminder.mockResolvedValue({
      sourceId: 's1',
      text: 'Namaste Mohan, Instalment 4 of LN-0042 for Rahul of Rs 5,625 is due.',
      smsText: 'Instalment 4 due.',
      mobile: '+919812345678',
      recipient: { id: 'p2', name: 'Mohan' },
      subjectLabel: 'Instalment 4 of LN-0042',
      fixedText: true,
      allowed: true,
      nextAllowedAt: null,
    });
    renderWithProviders(<RemindersPageContent />, { messages: MESSAGES });
    await user.click(await screen.findByRole('tab', { name: 'Loans' }));
    await user.click(await screen.findByRole('button', { name: 'Remind' }));

    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText(/Namaste Mohan/)).toBeInTheDocument();
    expect(within(sheet).getByText('To Mohan')).toBeInTheDocument();
    const whatsapp = within(sheet).getByRole('link', { name: 'WhatsApp' });
    expect(whatsapp.getAttribute('href')).toContain('919812345678');
    whatsapp.addEventListener('click', (event) => event.preventDefault());
    await user.click(whatsapp);

    await waitFor(() =>
      expect(moduleService.sendSourceReminder).toHaveBeenCalledWith(
        { sourceType: 'lending_instalment', sourceId: 's1' },
        'whatsapp_manual'
      )
    );
  });

  it('take Remind off a row once its send lands, whatever answer arrives last', async () => {
    // The look pass: the sheet closes on the tap, its refetch left before the
    // create-then-send pair was recorded, and the row kept a Remind the cap
    // refuses. The tab now asks again after the send, and ignores the older
    // answer even when it is the one that arrives last.
    const user = userEvent.setup();
    signIn(STAFF);
    const capped = { ...DUE, allowed: false, nextAllowedAt: '2026-10-13T08:00:00+05:30' };
    // The server answers with what is recorded when the request ARRIVES; an
    // answer from before the send is also the slow one, so it lands last.
    let recorded = false;
    moduleService.sendSourceReminder.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      recorded = true;
      return 's1';
    });
    moduleService.listModuleReminders.mockImplementation(async () => {
      if (recorded) return [capped, CAPPED];
      await new Promise((resolve) => setTimeout(resolve, 150));
      return [DUE, CAPPED];
    });
    moduleService.previewSourceReminder.mockResolvedValue({
      sourceId: 's1',
      text: 'Namaste Mohan',
      smsText: 'x',
      mobile: '+919812345678',
      recipient: { id: 'p2', name: 'Mohan' },
      subjectLabel: 'Instalment 4 of LN-0042',
      fixedText: true,
      allowed: true,
      nextAllowedAt: null,
    });
    renderWithProviders(<RemindersPageContent />, { messages: MESSAGES });
    await user.click(await screen.findByRole('tab', { name: 'Loans' }));
    await user.click(await screen.findByRole('button', { name: 'Remind' }));
    const whatsapp = await within(await screen.findByRole('dialog')).findByRole('link', {
      name: 'WhatsApp',
    });
    whatsapp.addEventListener('click', (event) => event.preventDefault());
    await user.click(whatsapp);

    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Remind' })).not.toBeInTheDocument(),
      { timeout: 4000 }
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('button', { name: 'Remind' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Next: 13/10/2026, 8:00 am')).toHaveLength(2);
  });

  it('replace the channels with the rule when the module says not now', async () => {
    const user = userEvent.setup();
    signIn(STAFF);
    moduleService.previewSourceReminder.mockResolvedValue({
      sourceId: 's1',
      text: 'x',
      smsText: 'x',
      mobile: '+919812345678',
      recipient: null,
      subjectLabel: 'Instalment 4 of LN-0042',
      fixedText: true,
      allowed: false,
      nextAllowedAt: '2026-10-13T08:00:00+05:30',
    });
    renderWithProviders(<RemindersPageContent />, { messages: MESSAGES });
    await user.click(await screen.findByRole('tab', { name: 'Loans' }));
    await user.click(await screen.findByRole('button', { name: 'Remind' }));

    const sheet = await screen.findByRole('dialog');
    expect(
      await within(sheet).findByText('This can be sent only during its sending hours.')
    ).toBeInTheDocument();
    expect(within(sheet).getByText('Next: 13/10/2026, 8:00 am')).toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
    expect(moduleService.sendSourceReminder).not.toHaveBeenCalled();
  });

  it('read in Hindi, and never print a raw module id', async () => {
    const user = userEvent.setup();
    signIn(STAFF);
    renderWithProviders(<RemindersPageContent />, {
      locale: 'hi',
      messages: hi as Record<string, string>,
    });
    // No lending catalogue in Hindi here: the tab falls back to a word.
    await user.click(await screen.findByRole('tab', { name: 'सुविधा' }));
    expect(await screen.findByRole('heading', { name: 'आज देय' })).toBeInTheDocument();
    expect(screen.queryByText('lending.reminders.tab')).not.toBeInTheDocument();
  });
});

describe('Sending hours in Settings', () => {
  const WINDOWS = {
    lending: { start: '08:00', end: '19:00', policyStart: '08:00', policyEnd: '19:00' },
  };

  it('let the owner narrow them, inside the module’s own hours only', async () => {
    const user = userEvent.setup();
    signIn([...STAFF, 'notifications.settings.manage', 'platform.tenant.manage']);
    store.dispatch({
      type: 'reminders/fetchReminderSettings/fulfilled',
      payload: { autoSms: false, partySmsOnEntry: false, smsConfigured: false, windows: WINDOWS },
    });
    service.updateReminderSettings.mockResolvedValue({
      autoSms: false,
      partySmsOnEntry: false,
      smsConfigured: false,
      windows: { lending: { ...WINDOWS.lending, start: '09:00' } },
    });
    renderWithProviders(<ReminderSettingsDialog open onOpenChange={() => undefined} />, {
      messages: MESSAGES,
    });

    expect(await screen.findByText('Loans: sending hours')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Loans: from' }));
    const options = await screen.findAllByRole('option');
    // 08:00 … 18:30 — nothing before the module's start, nothing at or after the end.
    expect(options[0]).toHaveTextContent('08:00');
    expect(options.map((o) => o.textContent)).not.toContain('07:30');
    expect(options.map((o) => o.textContent)).not.toContain('19:00');
    await user.click(screen.getByRole('option', { name: '09:00' }));

    await waitFor(() =>
      expect(service.updateReminderSettings).toHaveBeenCalledWith({
        windows: { lending: ['09:00', '19:00'] },
      })
    );
  });

  it('show them as text to anyone who is not the owner', async () => {
    signIn([...STAFF, 'notifications.settings.manage']);
    store.dispatch({
      type: 'reminders/fetchReminderSettings/fulfilled',
      payload: { autoSms: false, partySmsOnEntry: false, smsConfigured: false, windows: WINDOWS },
    });
    renderWithProviders(<ReminderSettingsDialog open onOpenChange={() => undefined} />, {
      messages: MESSAGES,
    });

    expect(await screen.findByText('Sent between 08:00 and 19:00.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
