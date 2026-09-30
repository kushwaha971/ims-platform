import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { responseObserved } from 'src/redux/slice/networkSlice';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { ALL_MESSAGES, hi } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { resetLedgerEntries } from 'modules/DigiKhaato/features/ledger/redux/ledgerEntrySlice';
import { resetLedgerForm } from 'modules/DigiKhaato/features/ledger/redux/ledgerFormSlice';

import { resetPartyDetail } from '../redux/partyDetailSlice';
import { resetPartyList } from '../redux/partyListSlice';

import { PartyDetailPageContent } from './PartyDetailPageContent';

/**
 * A6 (PLT-X04 §2 flows 2-4, §7-§8) — the khata's role badges, the "Guardian
 * and payer" section and the archive refusal a module's guard produces, from
 * the screen down to the service boundary.
 */
jest.mock('../api/partyService');
jest.mock('../api/partyRelationService');
jest.mock('../api/tagService');
jest.mock('modules/DigiKhaato/features/ledger/api/ledgerService');
jest.mock('modules/DigiKhaato/features/reminders/api/reminderService');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/parties/p1',
}));

const partyService = jest.requireMock('../api/partyService') as {
  getParty: jest.Mock;
  listParties: jest.Mock;
  archiveParty: jest.Mock;
};
const relationService = jest.requireMock('../api/partyRelationService') as {
  listPartyRelations: jest.Mock;
  createPartyRelation: jest.Mock;
  deletePartyRelation: jest.Mock;
};
const tagService = jest.requireMock('../api/tagService') as { listTags: jest.Mock };
const ledgerService = jest.requireMock('modules/DigiKhaato/features/ledger/api/ledgerService') as {
  listPartyEntries: jest.Mock;
};

const ID = '11111111-1111-4111-8111-111111111111';
const MOHAN = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Mohan',
  mobileMasked: 'XXXXXX5678',
  status: 'active' as const,
};
const RAHUL_END = { id: ID, name: 'Rahul', mobileMasked: null, status: 'active' as const };
const SITA = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Sita',
  mobileMasked: null,
  status: 'active' as const,
};

const PARTY = {
  id: ID,
  name: 'Rahul',
  displayCode: null,
  mobile: null,
  isCustomer: true,
  isSupplier: false,
  balance: '0.00',
  status: 'active' as const,
  lastActivityAt: null,
  tags: [],
  altPhone: null,
  email: null,
  gstin: null,
  gstRegistration: 'unregistered',
  stateCode: null,
  notes: '',
  collectionDate: null,
  creditLimit: null,
  creditDays: null,
  smsOptIn: false,
  consentSource: null,
  billingAddress: {},
  openingAmount: null,
  openingDirection: null,
  openingAsOf: null,
  createdAt: '2026-01-05T08:00:00Z',
  roles: ['gym_member'],
  roleBadges: [{ code: 'gym_member', module: 'gym', labelId: 'gym.role.members' }],
};

const GUARDIAN = {
  id: 'rel-1',
  kind: 'guardian' as const,
  receivesMessages: true,
  fromOn: '2026-09-01',
  toOn: null,
  active: true,
  party: RAHUL_END,
  relatedParty: MOHAN,
};
const PAYS_FOR_SITA = {
  id: 'rel-2',
  kind: 'payer' as const,
  receivesMessages: false,
  fromOn: '2026-09-01',
  toOn: null,
  active: true,
  party: SITA,
  relatedParty: RAHUL_END,
};

// The vertical ships these lines; the test stands in for its catalogue.
const MESSAGES = {
  ...ALL_MESSAGES.en,
  'gym.role.members': '{count, plural, one {Member} other {Members}}',
};

const signIn = (permissions: readonly PermissionCode[]): void => {
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
      activeTenant: { id: 't1', name: 'Fit Gym', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Fit Gym', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: ['parties'],
      version: 1,
    })
  );
};

const OWNER: PermissionCode[] = [
  'parties.party.read',
  'parties.party.write',
  'parties.party.delete',
];

beforeEach(() => {
  store.dispatch(resetPartyDetail());
  store.dispatch(resetPartyList());
  store.dispatch(resetLedgerForm());
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
  partyService.getParty.mockResolvedValue({
    party: PARTY,
    summary: { balance: '0.00' },
    credit: null,
  });
  relationService.listPartyRelations.mockResolvedValue({
    asPerson: [GUARDIAN],
    asRelated: [PAYS_FOR_SITA],
  });
  signIn(OWNER);
});

describe('Role badges and the guardian and payer section', () => {
  it('are absent for a business without a module that has roles', async () => {
    const { roles: _roles, roleBadges: _badges, ...plain } = PARTY;
    partyService.getParty.mockResolvedValue({
      party: plain,
      summary: { balance: '0.00' },
      credit: null,
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />, { messages: MESSAGES });

    expect(await screen.findAllByText('Rahul')).not.toHaveLength(0);
    await waitFor(() => expect(partyService.getParty).toHaveBeenCalled());
    expect(screen.queryByText('Guardian and payer')).not.toBeInTheDocument();
    expect(relationService.listPartyRelations).not.toHaveBeenCalled();
  });

  it("shows the module's badge and both directions of links", async () => {
    renderWithProviders(<PartyDetailPageContent id={ID} />, { messages: MESSAGES });

    expect(await screen.findByText('Member')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Guardian: Mohan' })).toHaveAttribute(
      'href',
      `/parties/${MOHAN.id}`
    );
    expect(screen.getByText('Gets reminders')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pays for Sita' })).toBeInTheDocument();
    expect(relationService.listPartyRelations).toHaveBeenCalledWith(ID, expect.anything());
  });

  it('links a payer with a key, and shows the new line', async () => {
    const user = userEvent.setup();
    relationService.listPartyRelations.mockResolvedValue({ asPerson: [], asRelated: [] });
    partyService.listParties.mockResolvedValue({
      rows: [{ ...PARTY, id: MOHAN.id, name: 'Mohan', mobile: '9812345678' }, { ...PARTY }],
      meta: { page: 1, pageSize: 8, total: 2, totalPages: 1 },
      totals: null,
    });
    relationService.createPartyRelation.mockResolvedValue({
      ...GUARDIAN,
      kind: 'payer',
      receivesMessages: true,
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />, { messages: MESSAGES });
    expect(await screen.findByText('No guardian or payer is linked.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Party/), 'Mo');
    const results = await within(dialog).findByRole('list', { name: 'Matching parties' });
    // The party whose khata this is is never offered as their own guardian.
    expect(within(results).queryByText('Rahul')).not.toBeInTheDocument();
    await user.click(within(results).getByText('Mohan'));
    await user.click(within(dialog).getByRole('radio', { name: 'Pays for' }));
    await user.click(within(dialog).getByRole('switch', { name: /Send reminders to them/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(relationService.createPartyRelation).toHaveBeenCalledWith(
        ID,
        { relatedPartyId: MOHAN.id, kind: 'payer', receivesMessages: true },
        expect.any(String)
      )
    );
    expect(await screen.findByRole('link', { name: 'Paid for by Mohan' })).toBeInTheDocument();
    expect(store.getState().snackbar.id).toBe('parties.relations.added');
  });

  it('asks before removing, and says so when the link was ended instead', async () => {
    const user = userEvent.setup();
    relationService.deletePartyRelation.mockResolvedValue({
      outcome: 'ended',
      relation: { ...GUARDIAN, toOn: '2026-09-30', active: false },
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />, { messages: MESSAGES });
    await screen.findByRole('link', { name: 'Guardian: Mohan' });

    const [firstRemove] = screen.getAllByRole('button', { name: 'Remove' });
    if (!firstRemove) throw new Error('no Remove button');
    await user.click(firstRemove);
    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByText(/Guardian: Mohan \(Guardian\)/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(relationService.deletePartyRelation).toHaveBeenCalledWith(ID, 'rel-1')
    );
    expect(await screen.findByText('Ended 30/09/2026')).toBeInTheDocument();
    expect(store.getState().snackbar.id).toBe('parties.relations.endedDone');
  });

  it('offers no Add or Remove to a role that only reads', async () => {
    signIn(['parties.party.read']);
    renderWithProviders(<PartyDetailPageContent id={ID} />, { messages: MESSAGES });

    await screen.findByRole('link', { name: 'Guardian: Mohan' });
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('reads in Hindi', async () => {
    renderWithProviders(<PartyDetailPageContent id={ID} />, {
      locale: 'hi',
      messages: hi as Record<string, string>,
    });

    expect(await screen.findByText('अभिभावक और भुगतानकर्ता')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'अभिभावक: Mohan' })).toBeInTheDocument();
    // No gym catalogue in Hindi here: no badge rather than an id or an empty word.
    expect(screen.queryByText('gym.role.members')).not.toBeInTheDocument();
    expect(screen.queryByText('भूमिका')).not.toBeInTheDocument();
  });
});

describe('Archive refused by a module', () => {
  it("swaps the dialog to the module's sentence, with the number", async () => {
    const user = userEvent.setup();
    partyService.archiveParty.mockRejectedValue({
      code: 'party_has_open_records',
      message: "Close this party's open records first.",
      details: { module: 'gym', count: 1, label_id: 'gym.archive.activeMemberships' },
      requestId: 'req_1',
      status: 409,
      warnings: [],
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />, {
      messages: {
        ...MESSAGES,
        'gym.archive.activeMemberships':
          'Gym has {count, plural, one {# active membership} other {# active memberships}} for {name}. End it first.',
      },
    });
    await screen.findByText('Member');

    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

    expect(
      await screen.findByText('Gym has 1 active membership for Rahul. End it first.')
    ).toBeInTheDocument();
    expect(screen.getByText('Rahul cannot be archived yet')).toBeInTheDocument();
  });

  it('falls back to a whole sentence when the module is not loaded here', async () => {
    const user = userEvent.setup();
    partyService.archiveParty.mockRejectedValue({
      code: 'party_has_open_records',
      message: '',
      details: { module: 'gym', count: 2, label_id: 'gym.archive.activeMemberships' },
      requestId: 'req_1',
      status: 409,
      warnings: [],
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />, { messages: MESSAGES });
    await screen.findByText('Member');
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive' })
    );

    expect(
      await screen.findByText('Rahul still has 2 open records. Close them first.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/gym\.archive/)).not.toBeInTheDocument();
  });
});
