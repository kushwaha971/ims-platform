import { screen } from '@testing-library/react';

import { responseObserved } from 'src/redux/slice/networkSlice';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { ModuleCode } from 'src/types/domain.types';

import { resetLedgerEntries } from 'modules/DigiKhaato/features/ledger/redux/ledgerEntrySlice';

import { resetPartyDetail } from '../redux/partyDetailSlice';

import { PartyDetailPageContent } from './PartyDetailPageContent';

/**
 * The khata's module panels are drawn for the modules that are ON — not only
 * while a module with party ROLES is on.
 *
 * Found by the Wave A gate's look pass (30 Sep 2026): a party holding a ₹380
 * deposit had no Deposits panel on the khata at either width. A6 mounted
 * `PartyModulePanels` inside the "Guardian and payer" block, which exists only
 * while the detail carries `roles`; A4b registered the deposit panel into that
 * registry under `payments`. So a deposit could be held, could block the
 * archive ("has a deposit held"), and there was no Return on the screen that
 * said so. Every unit test passed: DepositPanel's own suite renders it
 * directly, and nothing rendered the khata with a deposit and no roles.
 *
 * A panel may also say which parties it is for (`appliesTo`), so a module that
 * is on for every shop — payments — does not fetch its panel's chunk on every
 * khata to render nothing.
 */
jest.mock('../api/partyService');
jest.mock('../api/tagService');
jest.mock('modules/DigiKhaato/features/ledger/api/ledgerService');
jest.mock('modules/DigiKhaato/features/reminders/api/reminderService');
jest.mock('modules/DigiKhaato/features/payments/deposits/components/DepositPanel', () => {
  const { UbText } = jest.requireActual('src/design-system');
  return {
    DepositPanel: ({ party }: { party: { depositHeld?: string } }) => (
      <UbText>{`deposit panel · ${party.depositHeld ?? 'none'}`}</UbText>
    ),
  };
});
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/parties/p1',
}));

const partyService = jest.requireMock('../api/partyService') as { getParty: jest.Mock };
const tagService = jest.requireMock('../api/tagService') as { listTags: jest.Mock };
const ledgerService = jest.requireMock('modules/DigiKhaato/features/ledger/api/ledgerService') as {
  listPartyEntries: jest.Mock;
};
const reminderService = jest.requireMock(
  'modules/DigiKhaato/features/reminders/api/reminderService'
) as { listReminders: jest.Mock };

const ID = '11111111-1111-4111-8111-111111111111';
const PARTY = {
  id: ID,
  name: 'Asha Rao',
  displayCode: 'C-001',
  mobile: null,
  isCustomer: true,
  isSupplier: false,
  balance: '0.00',
  status: 'active' as const,
  lastActivityAt: '2026-09-18T10:00:00Z',
  tags: [],
  altPhone: null,
  email: null,
  gstin: null,
  gstRegistration: 'unregistered',
  stateCode: '27',
  notes: '',
  collectionDate: null,
  creditLimit: null,
  creditDays: null,
  smsOptIn: true,
  consentSource: null,
  billingAddress: null,
  openingAmount: null,
  openingDirection: null,
  openingAsOf: null,
  createdAt: '2026-01-05T08:00:00Z',
};

const signIn = (enabledModules: readonly ModuleCode[]): void => {
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
      permissions: ['parties.party.read', 'ledger.entry.read', 'payments.payment.read'],
      enabledModules: [...enabledModules],
      version: 1,
    })
  );
};

beforeEach(() => {
  store.dispatch(resetPartyDetail());
  store.dispatch(resetLedgerEntries());
  store.dispatch(responseObserved());
  jest.clearAllMocks();
  tagService.listTags.mockResolvedValue([]);
  ledgerService.listPartyEntries.mockResolvedValue({
    rows: [],
    nextCursor: null,
    hasMore: false,
    summary: { totalDebit: '0.00', totalCredit: '0.00', entryCount: 0 },
  });
  reminderService.listReminders.mockResolvedValue({
    rows: [],
    page: 1,
    pageSize: 5,
    total: 0,
    totals: { sent: 0, failed: 0, lastSentAt: null, lastChannel: null },
  });
});

describe('the khata draws module panels for the modules that are on', () => {
  it('shows the deposit panel for a party holding a deposit, with no module roles on', async () => {
    signIn(['parties', 'ledger', 'payments']);
    partyService.getParty.mockResolvedValue({
      party: { ...PARTY, depositHeld: '380.00' },
      summary: { balance: '0.00' },
      credit: null,
    });
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Asha Rao');
    // Rendered at every width (the rail and the phone's stack are one tree here).
    expect((await screen.findAllByText('deposit panel · 380.00')).length).toBeGreaterThan(0);
  });

  it('draws no deposit panel for a party the server sent no deposit figure for', async () => {
    signIn(['parties', 'ledger', 'payments']);
    partyService.getParty.mockResolvedValue({
      party: PARTY,
      summary: { balance: '0.00' },
      credit: null,
    });
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Asha Rao');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/deposit panel/)).not.toBeInTheDocument();
  });

  it('draws no deposit panel while payments is off, whatever the party holds', async () => {
    signIn(['parties', 'ledger']);
    partyService.getParty.mockResolvedValue({
      party: { ...PARTY, depositHeld: '380.00' },
      summary: { balance: '0.00' },
      credit: null,
    });
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Asha Rao');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/deposit panel/)).not.toBeInTheDocument();
  });
});
