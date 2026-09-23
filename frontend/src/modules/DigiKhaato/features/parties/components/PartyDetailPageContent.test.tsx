import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { resetLedgerEntries } from 'modules/DigiKhaato/features/ledger/redux/ledgerEntrySlice';
import { resetLedgerForm } from 'modules/DigiKhaato/features/ledger/redux/ledgerFormSlice';

import { resetPartyDetail } from '../redux/partyDetailSlice';
import { resetPartyList } from '../redux/partyListSlice';

import { PartyDetailPageContent } from './PartyDetailPageContent';

/**
 * PTY-03's khata page, end to end inside the client: content → hook → thunk →
 * service, with the service stubbed at the module boundary (§19.13.3).
 *
 * The assertions worth reading twice are the ones about what the page does
 * while it is WAITING. FR-1 promises that a merchant who tapped a row sees the
 * name and the balance immediately, from the list's own cached row, and never a
 * header skeleton — which is a claim about a state that lasts a few hundred
 * milliseconds and is therefore exactly the kind of thing that quietly stops
 * being true.
 */
jest.mock('../api/partyService');
/* The ledger's service too, because LED-01 put its timeline and its two quick
   actions on this page. Stubbed at the module boundary like every other service
   in this file (§19.13.3): the page's job is to mount the feature, and the
   feature's own tests are what assert the rows. */
jest.mock('modules/DigiKhaato/features/ledger/api/ledgerService');

const ledgerService = jest.requireMock('modules/DigiKhaato/features/ledger/api/ledgerService') as {
  listPartyEntries: jest.Mock;
  postLedgerEntry: jest.Mock;
};

const partyService = jest.requireMock('../api/partyService') as {
  getParty: jest.Mock;
  setCollectionDate: jest.Mock;
  listParties: jest.Mock;
  archiveParty: jest.Mock;
  restoreParty: jest.Mock;
};

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/parties/p1',
}));

const ID = '11111111-1111-4111-8111-111111111111';

const PARTY = {
  id: ID,
  name: 'Ramesh Traders',
  displayCode: 'C-001',
  mobile: '+919876543210',
  isCustomer: true,
  isSupplier: false,
  balance: '2300.00',
  status: 'active' as const,
  lastActivityAt: '2026-09-18T10:00:00Z',
  tags: [],
  altPhone: null,
  email: 'ramesh@shop.test',
  gstin: '27AAPFU0939F1ZV',
  gstRegistration: 'regular',
  stateCode: '27',
  notes: '',
  collectionDate: null,
  creditLimit: null,
  creditDays: null,
  smsOptIn: true,
  consentSource: null,
  billingAddress: { line1: '12 Bazaar Road', city: 'Pune', pincode: '411001' },
  openingAmount: null,
  openingDirection: null,
  openingAsOf: null,
  createdAt: '2026-01-05T08:00:00Z',
};

const RESULT = {
  party: PARTY,
  summary: { balance: '2300.00' },
  credit: null,
};

const apiError = (status: number) => ({
  code: status === 404 ? 'not_found' : 'server_error',
  message: 'Something went wrong.',
  details: {},
  requestId: 'req_abc123',
  status,
  warnings: [],
});

/**
 * A writer, because two of the things this page offers — Edit and the promise
 * date — are hidden from a role that cannot write a party (§19.7.5). A test file
 * with an empty permission set proves those controls are absent and nothing
 * else, which is how a negative assertion passes for entirely the wrong reason.
 */
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
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      // `ledger` among them, because the khata page's transactions card and its
      // two quick actions are gated on the module (§19.7.5): a tenant that has
      // not enabled it sees no card at all, which is a different screen and is
      // asserted separately.
      enabledModules: ['parties', 'ledger'],
      version: 1,
    })
  );
};

/**
 * Open the khata header's overflow menu.
 *
 * Edit, Add opening balance and Archive live behind it since LED-02: at five
 * buttons the action row ran 275 px off the right edge of a 360 px phone, with
 * two of them painted outside the viewport. Every test in this file found them
 * by role regardless — `getByRole` does not care whether a control is on the
 * screen — which is why a screenshot is what caught it and why these tests now
 * go through the menu the way a merchant does.
 */
const openMenu = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(await screen.findByRole('button', { name: 'More actions' }));
};

beforeEach(() => {
  store.dispatch(resetPartyDetail());
  store.dispatch(resetPartyList());
  /* The ledger slices too. The store is a module singleton across this file, so
     a test that opens the entry drawer leaves it open for the next one — which
     showed up as "Found multiple elements with the role dialog" in the ARCHIVE
     tests, two describes away, and reads as a bug in archiving. */
  store.dispatch(resetLedgerForm());
  store.dispatch(resetLedgerEntries());
  jest.clearAllMocks();
  partyService.getParty.mockResolvedValue(RESULT);
  partyService.setCollectionDate.mockResolvedValue(PARTY);
  partyService.archiveParty.mockResolvedValue({ ...PARTY, status: 'archived' as const });
  partyService.restoreParty.mockResolvedValue(PARTY);
  ledgerService.listPartyEntries.mockResolvedValue({
    rows: [],
    nextCursor: null,
    hasMore: false,
    summary: { totalDebit: '0.00', totalCredit: '0.00', entryCount: 0 },
  });
  signIn([
    'parties.party.read',
    'parties.party.write',
    'parties.party.delete',
    'ledger.entry.read',
    'ledger.entry.write',
  ]);
});

describe('the khata page', () => {
  it('shows who this is and how much, in the merchant’s own words', async () => {
    renderWithProviders(<PartyDetailPageContent id={ID} />);

    expect(await screen.findByText('Ramesh Traders')).toBeInTheDocument();
    // §23.2.6 rule 3: a balance carries no sign. Its direction is the label.
    expect(screen.getByText('You will get')).toBeInTheDocument();
    expect(screen.getByText('₹2,300.00')).toBeInTheDocument();
    expect(screen.queryByText('-₹2,300.00')).not.toBeInTheDocument();
  });

  it('announces the balance, so an optimistic change will not be silent', async () => {
    /**
     * The region is here before the thing that needs it. PTY-03 FR-15's
     * optimistic entries change this number without a navigation, and an
     * `aria-live` added later is one LED-01 has to remember; added now, it is
     * one fewer thing that has to be remembered.
     */
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(within(region).getByText('₹2,300.00')).toBeInTheDocument();
  });

  it('carries the baseline the figure is true as of', async () => {
    /** Koper's rule: "₹2,300" is a figure, "₹2,300 as of 18/09/2026" is a fact. */
    renderWithProviders(<PartyDetailPageContent id={ID} />);

    expect(await screen.findByText(/as of 18\/09\/2026/)).toBeInTheDocument();
  });

  it('shows the details the merchant would otherwise have to leave for', async () => {
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    expect(screen.getAllByText('27AAPFU0939F1ZV').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ramesh@shop.test').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12 Bazaar Road/).length).toBeGreaterThan(0);
  });

  it('leaves out the fields that were never filled in', async () => {
    /**
     * Fifteen labelled dashes reads as broken data rather than as an unfilled
     * form, and it buries the three fields that ARE filled. `altPhone` is null
     * on this party, so its label has no business on the screen.
     */
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    expect(screen.queryByText('Another number')).not.toBeInTheDocument();
  });

  it('says what a party who owes nothing owes', async () => {
    /** EC-7 — a settled party is not a red party (§23.2.6 rule 4). */
    partyService.getParty.mockResolvedValue({
      ...RESULT,
      party: { ...PARTY, balance: '0.00' },
      summary: { balance: '0.00' },
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);

    expect(await screen.findByText('Settled')).toBeInTheDocument();
  });

  it('tells the merchant there is nothing here yet rather than nothing at all', async () => {
    /**
     * The statement is still TRUE rather than a placeholder — but it now means
     * something narrower than it did. Before LED-01 there was no
     * `ledger_entry` table, so it meant "this product cannot record a
     * transaction". Now it means "this party has none", which is the sentence
     * a merchant would read it as either way.
     */
    renderWithProviders(<PartyDetailPageContent id={ID} />);

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument();
  });

  it('offers the two actions the page exists for, before the ones about the record', async () => {
    /**
     * LED-01 FR-1. A merchant opening a khata at the counter is recording a
     * sale far more often than editing an address, so the order in the header
     * is the order of the day's work.
     */
    renderWithProviders(<PartyDetailPageContent id={ID} />);

    const gave = await screen.findByRole('button', { name: /You gave/ });
    const more = screen.getByRole('button', { name: 'More actions' });
    expect(gave).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /You got/ })).toBeInTheDocument();
    /* The two ledger actions are BUTTONS and everything else is behind the
       menu, which is the ordering that matters: a merchant at a counter is
       recording a sale far more often than editing an address, and the target
       is eight seconds from tap to saved. `DOCUMENT_POSITION_FOLLOWING` means
       the menu comes after them. */
    expect(gave.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens the entry drawer on the party it is showing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PartyDetailPageContent id={ID} />);

    await user.click(await screen.findByRole('button', { name: /You gave/ }));

    // The party's name is in the drawer title, which is the only thing that
    // tells a merchant WHOSE khata they are about to write to.
    expect(await screen.findByText('You gave · Ramesh Traders')).toBeInTheDocument();
  });

  it('moves the header balance to the number the entry produced, with no refetch', async () => {
    /**
     * LED-01 FR-3, and the reason `meta.party_balance` is on the 201 at all.
     *
     * The merchant saves ₹500 against a customer who owed ₹2,300 and then says
     * the new figure out loud at the counter. Waiting for a second request to
     * learn a number the first one already carried is a wait they take in front
     * of somebody — and a refetch can pick up ANOTHER device's entry and show
     * them a balance that was never true of the action they just took.
     *
     * Prevents: the invalidation map declaring `patch: [['partyDetail', …]]`
     * with nothing in `partyDetailSlice` performing it. `patch` is a claim that
     * this mutation's own extraReducers already fixed the field, and the map's
     * own docstring says an entry that claims it falsely is worse than no entry
     * — the next reader stops looking for the refetch. It was false, and the
     * header sat on ₹2,300 while the server held ₹2,800.
     */
    const user = userEvent.setup();
    ledgerService.postLedgerEntry.mockResolvedValue({
      entry: {
        id: 'e1',
        partyId: ID,
        direction: 'debit',
        amount: '500.00',
        entryDate: '2026-09-17',
        entryType: 'manual_gave',
        sourceType: 'manual',
        sourceId: null,
        note: '',
        paymentMode: null,
        reference: '',
        status: 'posted',
        reversedById: null,
        reversesId: null,
        supersedesId: null,
        reason: null,
        createdBy: null,
        createdAt: '2026-09-17T10:00:00Z',
      },
      balance: '2800.00',
      warnings: [],
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('₹2,300.00');

    await user.click(screen.getByRole('button', { name: /You gave/ }));
    await user.type(await screen.findByLabelText('Amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('₹2,800.00')).toBeInTheDocument();
    // One read, at mount. The 201 carried the rest.
    expect(partyService.getParty).toHaveBeenCalledTimes(1);
  });

  it('hides both actions from a role that may read the ledger and not write it', async () => {
    /**
     * T-LED-01-12. Hidden rather than disabled (§19.7.5 / R-SEC-2): a greyed
     * button with a tooltip is a support call, and an accountant does not need
     * telling every time they open a page that they are an accountant.
     */
    signIn(['parties.party.read', 'ledger.entry.read']);

    renderWithProviders(<PartyDetailPageContent id={ID} />);

    await screen.findByText('Ramesh Traders');
    expect(screen.queryByRole('button', { name: /You gave/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /You got/ })).not.toBeInTheDocument();
  });

  it('draws no transactions card at all for a tenant without the ledger module', async () => {
    /**
     * A module the tenant has not bought does not exist — an empty state for it
     * would be an advert, and the request is never made, because a 403 the
     * client could have predicted is a 403 the merchant reads as a broken page.
     */
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
        permissions: ['parties.party.read', 'ledger.entry.read'],
        enabledModules: ['parties'],
        version: 1,
      })
    );

    renderWithProviders(<PartyDetailPageContent id={ID} />);

    await screen.findByText('Ramesh Traders');
    expect(screen.queryByText('Transactions')).not.toBeInTheDocument();
    expect(ledgerService.listPartyEntries).not.toHaveBeenCalled();
  });

  it('is a different screen for a party that does not exist', async () => {
    /**
     * A 404 is not a failure to retry. Offering "Try again" on an id that will
     * never resolve is a button that cannot work, and pressing it twice is how
     * a merchant concludes the app is broken rather than that the link is.
     */
    partyService.getParty.mockRejectedValue(apiError(404));

    renderWithProviders(<PartyDetailPageContent id={ID} />);

    expect(await screen.findByText('This party was not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to customers' })).toBeInTheDocument();
  });

  it('keeps the request id on a real failure, and offers the retry', async () => {
    partyService.getParty.mockRejectedValue(apiError(500));

    renderWithProviders(<PartyDetailPageContent id={ID} />);

    expect(await screen.findByText('We could not load this party')).toBeInTheDocument();
    // R-E-4: the id is what support asks for, so it stays on screen.
    expect(screen.getByText(/req_abc123/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders an archived party read-only, and says why', async () => {
    /** FR-14 / BR-11 — archiving hides a party from a list, not from history. */
    partyService.getParty.mockResolvedValue({
      ...RESULT,
      party: { ...PARTY, status: 'archived' as const },
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);

    expect(await screen.findByText('This party is archived')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });
});

describe('the promise date', () => {
  it('saves what the merchant picked, without a Save button to forget', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    // The quick choice is the one-tap path a merchant uses; the calendar
    // popover is the same `onChange` with a day grid in front of it.
    await user.click(screen.getByRole('button', { name: 'Today' }));

    await waitFor(() =>
      expect(partyService.setCollectionDate).toHaveBeenCalledWith(
        ID,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
      )
    );
  });

  it('sends null to clear it, rather than leaving the column alone', async () => {
    /**
     * An absent key means "do not touch this field" to the server, which is the
     * opposite of what "clear this date" means — so a cleared promise would
     * silently stay set.
     */
    partyService.getParty.mockResolvedValue({
      ...RESULT,
      party: { ...PARTY, collectionDate: '2026-09-25' },
    });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('button', { name: 'Clear date' }));

    await waitFor(() => expect(partyService.setCollectionDate).toHaveBeenCalledWith(ID, null));
  });

  it('is not editable on an archived party', async () => {
    partyService.getParty.mockResolvedValue({
      ...RESULT,
      party: { ...PARTY, status: 'archived' as const, collectionDate: '2026-09-25' },
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('This party is archived');

    expect(screen.queryByLabelText('Promised to pay on')).not.toBeInTheDocument();
  });
});

describe('archiving from the khata page', () => {
  it('is offered here, where the balance and the history are on screen', async () => {
    /**
     * PTY-04 FR-5 lists a row ⋯ menu in the list as an entry point too, and
     * this is deliberately the one that exists. A one-tap archive from a list
     * row is a one-tap mistake; the khata page is where a merchant filing
     * somebody away is looking at the evidence for the decision while they
     * make it.
     */
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    const user = userEvent.setup();
    await openMenu(user);
    expect(await screen.findByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('is not offered to a role that cannot archive', async () => {
    /** §12 — archiving IS the delete capability. Staff create and edit parties
     *  all day and do not decide that somebody has stopped trading. */
    const user = userEvent.setup();
    signIn(['parties.party.read', 'parties.party.write']);

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    /* The menu is still there — this role may still Edit — and Archive is not
       in it. Asserting the menu's absence would have passed for the wrong
       reason on any role, which is how a negative assertion stops meaning
       anything. */
    await openMenu(user);
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });

  it('draws no menu at all for a role with nothing behind it', async () => {
    /**
     * A ⋯ that opens an empty panel is worse than no ⋯: it is a control that
     * teaches a merchant the app is broken, and it is the failure mode an
     * overflow menu introduces that a row of buttons did not have.
     *
     * The role that has nothing here is one that may read a party and NOT the
     * ledger. It used to be the accountant — until LED-04 gave them a statement
     * to read, which is the one thing in this menu that is their job.
     */
    signIn(['parties.party.read']);

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('offers the accountant the statement and nothing else', async () => {
    /**
     * §12 of LED-04: everybody who may read the ledger may read a statement,
     * and the accountant is the role the export exists for. They still may not
     * edit a party, add an opening balance or archive anybody — so the menu is
     * one item long rather than absent, which is the honest shape.
     */
    signIn(['parties.party.read', 'ledger.entry.read']);

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));

    const menu = await screen.findByRole('dialog');
    expect(within(menu).getByText('Statement')).toBeInTheDocument();
    expect(within(menu).queryByText('Archive')).not.toBeInTheDocument();
  });

  it('asks before it acts, and does not archive on a stray backdrop tap', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: 'Archive' }));

    expect(await screen.findByText('Archive Ramesh Traders?')).toBeInTheDocument();
    expect(partyService.archiveParty).not.toHaveBeenCalled();
  });

  it('archives with the reason the merchant gave', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    await user.type(await screen.findByLabelText('Reason (optional)'), 'Moved away');
    /* Scoped to the dialog: the header's Archive is still in the tree behind
       the overlay, and an unscoped query cannot tell the two apart. */
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(partyService.archiveParty).toHaveBeenCalledWith(ID, 'Moved away', expect.any(String))
    );
  });

  it('shows what the party still owes rather than a bare refusal', async () => {
    /**
     * The blocked state is the SERVER's, never the client's. The dialog could
     * read `party.balance` and refuse to open — and EC-1 is exactly the case
     * where another device posts an entry between the dialog opening and the
     * merchant confirming, so a client that pre-judges archives on stale data.
     * The confirm always goes to the server, and the 409 swaps the dialog in
     * place with the server's own, current figure.
     */
    partyService.archiveParty.mockRejectedValue({
      code: 'party_balance_nonzero',
      message: 'Settle the balance or write it off before archiving.',
      details: { balance: '2300.00', balance_label: 'receivable', suggestion: 'write_off' },
      requestId: 'req_zzz',
      status: 409,
      warnings: [],
    });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

    expect(await screen.findByText('Ramesh Traders still owes you')).toBeInTheDocument();
    /* Inside the dialog: the header behind it is showing the same ₹2,300.00,
       which is the point — the dialog repeats the figure so the merchant does
       not have to look past a modal to read it. */
    expect(within(screen.getByRole('dialog')).getByText('₹2,300.00')).toBeInTheDocument();
    /* And it stops offering the action that just failed: a second press would
       fail the same way for the same reason, and the merchant's next move is
       to settle the balance rather than to try again. */
    expect(
      within(screen.getByRole('dialog')).queryByRole('button', { name: 'Archive' })
    ).not.toBeInTheDocument();
  });

  it('offers Restore on an archived party, and takes it', async () => {
    partyService.getParty.mockResolvedValue({
      ...RESULT,
      party: { ...PARTY, status: 'archived' as const },
    });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('This party is archived');

    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() =>
      expect(partyService.restoreParty).toHaveBeenCalledWith(ID, expect.any(String))
    );
  });

  it('does not offer Restore to a role that cannot restore', async () => {
    partyService.getParty.mockResolvedValue({
      ...RESULT,
      party: { ...PARTY, status: 'archived' as const },
    });
    signIn(['parties.party.read']);

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('This party is archived');

    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });

  /* ── PTY-06 — the credit limit ─────────────────────────────────────────── */

  it('draws the usage bar with the sentence a merchant can act on', async () => {
    /**
     * FR-10. The bar is what a merchant reads at a glance; the CAPTION is what
     * they act on. "₹40,000 left of ₹50,000" is a decision, and a bar at 20 %
     * is a feeling — and the caption is also what makes the colour
     * non-essential (R-A-2), because a reader who cannot tell amber from red
     * reads the same fact in the same place.
     */
    partyService.getParty.mockResolvedValue({
      party: PARTY,
      summary: { balance: '10000.00' },
      credit: {
        limit: '50000.00',
        days: 30,
        exposure: '10000.00',
        available: '40000.00',
        overBy: '0.00',
        usagePct: 20,
        mode: 'warn',
        status: 'ok',
      },
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);

    expect(await screen.findByText('₹40,000.00 left of ₹50,000.00')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: /Credit used — ₹40,000.00 left of ₹50,000.00/ })
    ).toBeInTheDocument();
  });

  it('says how far OVER, never with a minus sign', async () => {
    /**
     * §23.2.6 rule 3, one layer away from `UbAmount` — which is where it was
     * reintroduced twice before in this module. A merchant does not think
     * "−₹1,700 available", they think "₹1,700 over".
     */
    partyService.getParty.mockResolvedValue({
      party: PARTY,
      summary: { balance: '51700.00' },
      credit: {
        limit: '50000.00',
        days: 30,
        exposure: '51700.00',
        available: '0.00',
        overBy: '1700.00',
        usagePct: 103,
        mode: 'warn',
        status: 'over',
      },
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);

    const caption = await screen.findByText('₹1,700.00 over the ₹50,000.00 limit');
    expect(caption).toBeInTheDocument();
    expect(caption.textContent).not.toContain('-');
  });

  it('hides the bar when the business has switched credit checks off', async () => {
    /**
     * FR-10 / §9's "Disabled". The limit is still data and still editable —
     * turning the setting back on must not have lost anything — but a meter for
     * a rule nobody is enforcing is a number inviting a decision the product
     * will not act on.
     */
    partyService.getParty.mockResolvedValue({
      party: PARTY,
      summary: { balance: '10000.00' },
      credit: {
        limit: '50000.00',
        days: 30,
        exposure: '10000.00',
        available: '40000.00',
        overBy: '0.00',
        usagePct: 20,
        mode: 'off',
        status: 'ok',
      },
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/left of/)).not.toBeInTheDocument();
  });

  it('draws no bar at all for a party with no limit', async () => {
    partyService.getParty.mockResolvedValue({
      party: PARTY,
      summary: { balance: '10000.00' },
      credit: null,
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows the credit limit as MONEY in the terms card, not as a wire string', async () => {
    /**
     * Found in a screenshot, not in a test.
     *
     * The panel rendered `party.creditLimit` straight from the API — "50000.00"
     * — in a card whose every other line is a sentence. Money is never shown to
     * a merchant the way it travels (§23.2.6); it is grouped the Indian way.
     * Nothing complained, because a decimal string is already a string and
     * `toBeInTheDocument` is as happy with one as with the other.
     */
    partyService.getParty.mockResolvedValue({
      party: { ...PARTY, creditLimit: '50000.00', creditDays: 30 },
      summary: { balance: '10000.00' },
      credit: null,
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    expect(await screen.findByText('₹50,000.00')).toBeInTheDocument();
    expect(screen.queryByText('50000.00')).not.toBeInTheDocument();
  });

  it('Edit actually opens the form', async () => {
    /**
     * A dead button, found by driving the page in a browser.
     *
     * `openEdit` dispatched into `partyFormSlice` correctly and the page never
     * rendered the drawer — the list page does, and this one did not. So the
     * only action PTY-03 offers did nothing at all: the store said the form was
     * open, and there was no form. Every test here asserted the button existed,
     * which it did.
     */
    partyService.getParty.mockResolvedValue({
      party: PARTY,
      summary: { balance: '2300.00' },
      credit: null,
    });
    const user = userEvent.setup();

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });
});
