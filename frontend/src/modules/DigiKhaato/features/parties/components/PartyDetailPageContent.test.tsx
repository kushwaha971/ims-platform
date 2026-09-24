import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';
import { formatBusinessDate, todayInTenantTz } from 'src/utils/dates';

import { resetLedgerEntries } from 'modules/DigiKhaato/features/ledger/redux/ledgerEntrySlice';
import { postEntry, reverseEntry } from 'modules/DigiKhaato/features/ledger/redux/ledgerEntryThunk';
import { resetLedgerForm } from 'modules/DigiKhaato/features/ledger/redux/ledgerFormSlice';

import { resetPartyDetail } from '../redux/partyDetailSlice';
import { resetPartyForm } from '../redux/partyFormSlice';
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
  reverseLedgerEntry: jest.Mock;
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

  it('shows the mobile as the reminder sheet does, and dials and copies it normalised', async () => {
    /* Prevents the QA O6 follow-up: the header and the info panel's "Mobile
       number" printed the mobile as stored — "09812345678" — while the
       reminder sheet on the same page printed "+91 98123 45678". The DISPLAY
       goes through `formatPhoneForDisplay`; the `tel:` href and the Copy
       button get the normalised E.164 ("+919812345678"): dialable anywhere,
       no spaces for a paste target to choke on. */
    const user = userEvent.setup();
    partyService.getParty.mockResolvedValue({
      ...RESULT,
      party: { ...PARTY, mobile: '09812345678' },
    });
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');

    const call = screen.getByRole('link', { name: '+91 98123 45678' });
    expect(call).toHaveAttribute('href', 'tel:+919812345678');
    // The header's link, and the info panel's "Mobile number" value.
    expect(screen.getAllByText('+91 98123 45678').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('09812345678')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await navigator.clipboard.readText()).toBe('+919812345678');
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

  it('moves the header balance to the number the entry produced, before any refetch lands', async () => {
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
     *
     * NEW-2 changed the second half of this test and not the first. The entry
     * now DOES refetch the party — the credit block is computed by the server
     * and nothing in the 201 carries it — so the claim is that the header moves
     * from the 201 while that refetch is still in the air, not that there is
     * no refetch. The refetch is held open here so the figure on screen can
     * only have come from the patch.
     */
    const user = userEvent.setup();
    partyService.getParty
      .mockResolvedValueOnce(RESULT)
      .mockReturnValue(new Promise(() => undefined));
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
    // The read at mount, and the credit block's refetch — still pending, so the
    // ₹2,800 above is the 201's figure and nobody else's.
    await waitFor(() => expect(partyService.getParty).toHaveBeenCalledTimes(2));
    expect(screen.getByText('₹2,800.00')).toBeInTheDocument();
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

  it('offers the accountant the statement and the reminder, and nothing that writes', async () => {
    /**
     * §12 of LED-04: everybody who may read the ledger may read a statement,
     * and the accountant is the role the export exists for. They still may not
     * edit a party, add an opening balance or archive anybody — so the menu is
     * short rather than absent, which is the honest shape.
     *
     * LED-06's reminder is in it too, and that is a decision: nothing is
     * written (no `ledger_reminder` row exists to write), the merchant sends
     * the text from their own phone, and anybody who can read the balance
     * could type it. `ledger.reminder.write` takes over the day it writes.
     */
    signIn(['parties.party.read', 'ledger.entry.read']);

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));

    const menu = await screen.findByRole('dialog');
    expect(within(menu).getByText('Statement')).toBeInTheDocument();
    expect(within(menu).getByText('Send reminder')).toBeInTheDocument();
    expect(within(menu).queryByText('Archive')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Edit')).not.toBeInTheDocument();
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
      expect(partyService.archiveParty).toHaveBeenCalledWith(
        ID,
        'Moved away',
        expect.any(String),
        undefined // no write-off on a plain archive
      )
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

  const blockOnce = (): void => {
    partyService.archiveParty.mockRejectedValueOnce({
      code: 'party_balance_nonzero',
      message: 'Settle the balance or write it off before archiving.',
      details: { balance: '2300.00', balance_label: 'receivable', suggestion: 'write_off' },
      requestId: 'req_zzz',
      status: 409,
      warnings: [],
    });
  };

  const reachBlocked = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');
    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await screen.findByText('Ramesh Traders still owes you');
    return screen.getByRole('dialog');
  };

  it('offers both ways out of a blocked archive now that the ledger exists', async () => {
    /**
     * FR-10 / AC-2: Record payment, Write off ₹2,300 and Cancel. Until LED-01
     * the dialog could only explain; a blocked dialog that still only explains
     * leaves the merchant to find the entry drawer and come back.
     */
    blockOnce();
    const user = userEvent.setup();
    const dialog = await reachBlocked(user);

    expect(within(dialog).getByRole('button', { name: 'Record payment' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Write off ₹2,300.00' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('keeps the destructive Write off off the top of a phone sheet (UAT)', async () => {
    /**
     * Prevents the UAT finding: the DOM order was Cancel, Record payment,
     * Write off and the phone footer reversed it, so the destructive Write off
     * was the TOP button. It sits between Cancel and Record payment, so on a
     * laptop the row reads Cancel · Write off · Record payment with the
     * primary at the right.
     */
    blockOnce();
    const user = userEvent.setup();
    const dialog = await reachBlocked(user);

    const names = within(dialog)
      .getAllByRole('button')
      .map((button) => button.textContent ?? '')
      .filter(
        (name) => ['Cancel', 'Record payment'].includes(name) || name.startsWith('Write off')
      );
    expect(names).toEqual(['Cancel', 'Write off ₹2,300.00', 'Record payment']);
  });

  it('tabs through the blocked actions in the order a phone shows them (D-L6)', async () => {
    /**
     * Prevents D-L6: the footer was `flex-col-reverse` below `sm`, so a phone
     * showed Record payment · Write off · Cancel top to bottom while Tab went
     * Cancel → Write off → Record payment — from the bottom button upwards.
     * jsdom lays nothing out, so the stacking class is what can be pinned: the
     * blocked footer stacks in DOM order, and Tab walks that order.
     */
    blockOnce();
    const user = userEvent.setup();
    const dialog = await reachBlocked(user);

    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const writeOff = within(dialog).getByRole('button', { name: 'Write off ₹2,300.00' });
    const record = within(dialog).getByRole('button', { name: 'Record payment' });
    const footer = cancel.parentElement as HTMLElement;
    expect(footer).toContainElement(record);
    expect(footer).toHaveClass('flex-col');
    expect(footer).not.toHaveClass('flex-col-reverse');

    cancel.focus();
    await user.tab();
    expect(writeOff).toHaveFocus();
    await user.tab();
    expect(record).toHaveFocus();
  });

  it('moves focus to the refusal when the dialog swaps to blocked, so Tab reaches Cancel first (M4)', async () => {
    /**
     * Prevents M4: pressing Archive unmounted the Archive button when the body
     * swapped to "blocked", focus fell to <body>, and the first Tab landed on
     * "Write off ₹…" — Enter then opened the write-off. Focus must land inside
     * the dialog on the explanation of WHY it was refused, and the first Tab
     * from there must be Cancel, never the destructive Write off.
     */
    blockOnce();
    const user = userEvent.setup();
    const dialog = await reachBlocked(user);

    const explanation = within(dialog).getByText('Settle the balance before archiving.')
      .parentElement as HTMLElement;
    await waitFor(() => expect(explanation).toHaveFocus());
    expect(document.body).not.toHaveFocus();

    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('opens You got with the outstanding amount already in it', async () => {
    /**
     * Prevents the UAT finding: Record payment opened the drawer in the right
     * direction but EMPTY, so the merchant had to read ₹2,300.00 off the
     * dialog that had just closed and type it back in. The magnitude arrives
     * prefilled — and stays editable, because a part payment is the common case.
     */
    blockOnce();
    const user = userEvent.setup();
    const dialog = await reachBlocked(user);

    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }));

    const amount = await screen.findByLabelText('Amount');
    expect(amount).toHaveValue('2300.00');
    expect(screen.getByRole('radio', { name: /You got/ })).toBeChecked();

    await user.clear(amount);
    await user.type(amount, '500');
    expect(amount).toHaveValue('500');
  });

  it('waits for a reason and the acknowledgement before it writes anything off', async () => {
    /**
     * T-PTY-04-14. A write-off is a financial decision; the destructive button
     * must not be reachable by a merchant holding Enter or tapping through.
     */
    blockOnce();
    const user = userEvent.setup();
    const dialog = await reachBlocked(user);
    await user.click(within(dialog).getByRole('button', { name: 'Write off ₹2,300.00' }));

    const confirm = await within(dialog).findByRole('button', { name: 'Write off and archive' });
    expect(confirm).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText('Why are you writing this off?'),
      'Cannot recover'
    );
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByLabelText('I understand this money is written off'));
    expect(confirm).toBeEnabled();
  });

  it('writes off exactly the amount the merchant confirmed', async () => {
    /**
     * FR-3 and the confirmed-amount rule: the server writes off the balance it
     * reads under the lock and refuses when it differs from what the dialog
     * showed, so the client must SEND what it showed.
     */
    blockOnce();
    const user = userEvent.setup();
    const dialog = await reachBlocked(user);
    await user.click(within(dialog).getByRole('button', { name: 'Write off ₹2,300.00' }));
    await user.type(
      within(dialog).getByLabelText('Why are you writing this off?'),
      'Cannot recover'
    );
    await user.click(within(dialog).getByLabelText('I understand this money is written off'));
    await user.click(within(dialog).getByRole('button', { name: 'Write off and archive' }));

    await waitFor(() =>
      expect(partyService.archiveParty).toHaveBeenLastCalledWith(
        ID,
        '',
        expect.any(String),
        expect.objectContaining({ reason: 'Cannot recover', amount: '2300.00' })
      )
    );
  });

  /**
   * FB-1 (QA, 23 Sep 2026) — writing off a PAYABLE balance always failed. The
   * 409 carries the signed balance ("-500.00"), the hook sent it verbatim as
   * `write_off.amount`, and the server — which confirms against |balance| —
   * refused every one with "Enter an amount greater than 0". The dialog printed
   * the sign too: "Write off ₹-500.00".
   */
  const blockPayableOnce = (): void => {
    partyService.archiveParty.mockRejectedValueOnce({
      code: 'party_balance_nonzero',
      message: 'Settle the balance or write it off before archiving.',
      details: { balance: '-500.00', balance_label: 'payable', suggestion: 'write_off' },
      requestId: 'req_pay',
      status: 409,
      warnings: [],
    });
  };

  const reachPayableWriteOff = async (
    user: ReturnType<typeof userEvent.setup>
  ): Promise<HTMLElement> => {
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');
    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await screen.findByText('You still owe Ramesh Traders');
    const blocked = screen.getByRole('dialog');
    // The figure is positive; the words carry the direction.
    expect(within(blocked).getByText('₹500.00')).toBeInTheDocument();
    expect(within(blocked).queryByText(/-500|−500/)).not.toBeInTheDocument();
    await user.click(within(blocked).getByRole('button', { name: 'Write off ₹500.00' }));
    return blocked;
  };

  it('writes off a payable balance as its positive magnitude (FB-1)', async () => {
    blockPayableOnce();
    const user = userEvent.setup();
    const dialog = await reachPayableWriteOff(user);

    expect(
      within(dialog).getByText(
        'Your ledger gets a ₹500.00 write-off, and what you owe Ramesh Traders becomes ₹0.'
      )
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Why are you writing this off?'), 'Shop closed');
    await user.click(within(dialog).getByLabelText('I understand this money is written off'));
    await user.click(within(dialog).getByRole('button', { name: 'Write off and archive' }));

    await waitFor(() =>
      expect(partyService.archiveParty).toHaveBeenLastCalledWith(
        ID,
        '',
        expect.any(String),
        expect.objectContaining({ reason: 'Shop closed', amount: '500.00' })
      )
    );
  });

  it('re-shows the new figure on balance_changed and confirms the new magnitude (FB-1)', async () => {
    /**
     * EC-1 for write-offs. The server's `balance_changed` carries the new
     * signed `balance` and its own `amount` (|balance|); the dialog must show
     * the new figure, drop the old acknowledgement, and send the new magnitude.
     */
    blockPayableOnce();
    partyService.archiveParty.mockRejectedValueOnce({
      code: 'balance_changed',
      message: 'The balance changed since you confirmed the write-off. Check the new amount.',
      details: {
        balance: '-750.00',
        balance_label: 'payable',
        amount: '750.00',
        confirmed_amount: '500.00',
      },
      requestId: 'req_chg',
      status: 409,
      warnings: [],
    });
    const user = userEvent.setup();
    const dialog = await reachPayableWriteOff(user);

    await user.type(within(dialog).getByLabelText('Why are you writing this off?'), 'Shop closed');
    await user.click(within(dialog).getByLabelText('I understand this money is written off'));
    await user.click(within(dialog).getByRole('button', { name: 'Write off and archive' }));

    expect(
      await within(dialog).findByText(
        'Your ledger gets a ₹750.00 write-off, and what you owe Ramesh Traders becomes ₹0.'
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'The balance changed since you confirmed the write-off. Check the new amount.'
      )
    ).toBeInTheDocument();
    // The tick was for ₹500.00; it does not carry over to ₹750.00.
    const confirm = within(dialog).getByRole('button', { name: 'Write off and archive' });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByLabelText('I understand this money is written off'));
    await user.click(confirm);
    await waitFor(() =>
      expect(partyService.archiveParty).toHaveBeenLastCalledWith(
        ID,
        '',
        expect.any(String),
        expect.objectContaining({ amount: '750.00' })
      )
    );
  });

  it('does not offer a write-off to a role without ledger.entry.write', async () => {
    /** T-PTY-04-12: archive rights alone do not make a write-off. */
    signIn([
      'parties.party.read',
      'parties.party.write',
      'parties.party.delete',
      'ledger.entry.read',
    ]);
    blockOnce();
    const user = userEvent.setup();
    const dialog = await reachBlocked(user);

    expect(within(dialog).queryByRole('button', { name: /Write off/ })).not.toBeInTheDocument();
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

describe('sending a reminder from the khata page (LED-06)', () => {
  /* jsdom cannot navigate; the browser would follow the link after the click. */
  const swallowNavigation = (event: MouseEvent) => {
    if ((event.target as Element | null)?.closest('a')) event.preventDefault();
  };
  beforeEach(() => document.addEventListener('click', swallowNavigation));
  afterEach(() => document.removeEventListener('click', swallowNavigation));

  const openReminder = async (user: ReturnType<typeof userEvent.setup>) => {
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');
    await openMenu(user);
    await user.click(await screen.findByRole('button', { name: 'Send reminder' }));
    return screen.findByRole('dialog', { name: 'Send reminder' });
  };

  it('composes the message from the shop, the party, the header balance and today', async () => {
    /* Prevents: a reminder whose figure differs from the one on the header
       the merchant is looking at, one that names the wrong business, one that
       prints "₹₹" or an ungrouped figure, and one dated from the last entry
       rather than the day it is sent. */
    const user = userEvent.setup();
    const sheet = await openReminder(user);
    const today = formatBusinessDate(todayInTenantTz('Asia/Kolkata'));
    const expected =
      `Namaste Ramesh Traders,\nRs 2,300.00 is pending with Kumar Stores as of ${today}.\n` +
      'Kindly pay at your convenience. Thank you.\n— Kumar Stores';

    expect(sheet.querySelector('[data-ub-share-preview]')?.textContent).toBe(expected);
    // QA O6: the recipient's mobile is shown normalised, as the link dials it.
    expect(sheet).toHaveAccessibleDescription('To Ramesh Traders · +91 98765 43210');
    const href = within(sheet).getByRole('link', { name: 'WhatsApp' }).getAttribute('href') ?? '';
    expect(href.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    expect(new URL(href).searchParams.get('text')).toBe(expected);
  });

  it('says WhatsApp was OPENED — never that a reminder was sent', async () => {
    /* Prevents: DEC-012 / NTF-03 BR-1 broken in the snackbar. Nothing is sent
       by this product; the merchant still has to press send in WhatsApp. And
       no request is made, because there is no reminder table to write. */
    const user = userEvent.setup();
    const sheet = await openReminder(user);
    await user.click(within(sheet).getByRole('link', { name: 'WhatsApp' }));

    const snackbar = store.getState().snackbar;
    expect(snackbar.id).toBe('share.opened.whatsapp');
    expect(snackbar.snackbarSeverity).toBe('info');
    expect(JSON.stringify(snackbar)).not.toMatch(/sent/i);
    expect(ledgerService.postLedgerEntry).not.toHaveBeenCalled();
  });

  it.each([
    ['a party the merchant owes (payable)', '-2300.00'],
    ['a settled party', '0.00'],
  ])('is not offered for %s', async (_label, balance) => {
    /* Prevents: LED-06 FR-8 — "please pay" sent to a supplier the merchant
       owes, or to somebody who owes nothing. The menu is still there (Edit),
       so the absence is about the balance and not about the role. */
    partyService.getParty.mockResolvedValue({
      ...RESULT,
      party: { ...PARTY, balance },
      summary: { balance },
    });
    const user = userEvent.setup();
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');
    await openMenu(user);

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send reminder' })).not.toBeInTheDocument();
  });

  it('is not offered to a role that cannot read the ledger', async () => {
    /* Prevents: a role with no view of the balance being handed a message
       that contains it. */
    signIn(['parties.party.read', 'parties.party.write']);
    const user = userEvent.setup();
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');
    await openMenu(user);

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send reminder' })).not.toBeInTheDocument();
  });

  it('is not offered on an archived party', async () => {
    /* Prevents: FR-14 — chasing a party the merchant has filed away, from a
       page that is read-only. */
    partyService.getParty.mockResolvedValue({
      ...RESULT,
      party: { ...PARTY, status: 'archived' as const },
    });
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');
    await screen.findByText(/archived/i);

    expect(screen.queryByRole('button', { name: 'Send reminder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Send reminder' })).not.toBeInTheDocument();
  });
});

describe('focus returns to ⋯ when a dialog opened from the header menu closes (D1, WCAG 2.4.3)', () => {
  /**
   * Prevents QA defect D1 (Sprint 3): keyboard ⋯ → Enter → "Send reminder" →
   * Escape left focus on <body>. The menu sheet closes (and restores focus to
   * ⋯) BEFORE the lazily mounted share sheet exists, so the share sheet never
   * saw its opener take focus and had nothing to return to — a keyboard user
   * was dropped at the top of the document. The archive dialog is mounted the
   * same way and had the same defect.
   */
  /* The party form's slice is not reset by the file's own beforeEach, so the
     earlier "Edit actually opens the form" test leaves the drawer open, and
     this block would be closing a drawer that was never opened from the menu. */
  beforeEach(() => {
    store.dispatch(resetPartyForm());
  });

  const openFromMenu = async (user: ReturnType<typeof userEvent.setup>, item: string) => {
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');
    const more = await screen.findByRole('button', { name: 'More actions' });
    more.focus();
    await user.keyboard('{Enter}');
    const menuItem = await screen.findByRole('button', { name: item });
    menuItem.focus();
    await user.keyboard('{Enter}');
    return more;
  };

  it.each([
    ['the reminder sheet', 'Send reminder', 'Send reminder'],
    ['the archive dialog', 'Archive', 'Archive Ramesh Traders?'],
    ['the edit drawer', 'Edit', 'Edit party'],
    ['the opening balance drawer', 'Add opening balance', 'Opening balance'],
  ])('returns focus to ⋯ after Escape on %s', async (_label, item, dialogName) => {
    const user = userEvent.setup();
    const more = await openFromMenu(user, item);
    const dialog = await screen.findByRole('dialog', { name: dialogName });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: dialogName })).not.toBeInTheDocument()
    );
    expect(document.activeElement).toBe(more);
  });

  it.each([
    ['the reminder sheet', 'Send reminder', 'Send reminder'],
    ['the archive dialog', 'Archive', 'Archive Ramesh Traders?'],
  ])('returns focus to ⋯ after ✕ on %s', async (_label, item, dialogName) => {
    const user = userEvent.setup();
    const more = await openFromMenu(user, item);
    const dialog = await screen.findByRole('dialog', { name: dialogName });

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: dialogName })).not.toBeInTheDocument()
    );
    expect(document.activeElement).toBe(more);
  });
});

describe('an archived party’s timeline (QA O4)', () => {
  const CEMENT_PAGE = {
    rows: [
      {
        id: 'e1',
        partyId: ID,
        direction: 'debit',
        amount: '500.00',
        entryDate: '2026-09-17',
        entryType: 'manual_gave',
        sourceType: 'manual',
        sourceId: null,
        note: 'Cement bags',
        paymentMode: null,
        reference: '',
        status: 'posted',
        reversedById: null,
        reversesId: null,
        supersedesId: null,
        reason: null,
        createdBy: { id: 'u1', name: 'Owner' },
        createdAt: '2026-09-17T10:00:00Z',
      },
    ],
    nextCursor: null,
    hasMore: false,
    summary: { totalDebit: '500.00', totalCredit: '0.00', entryCount: 1 },
  };

  it('offers no Correct / Reverse ⋯ on its rows, because the server refuses both', async () => {
    /* Prevents QA O4: the khata page hid You gave / You got for an archived
       party but each timeline row's ⋯ still offered "Correct this entry /
       Reverse this entry", which the server answers with 409 party_archived.
       Hidden rather than disabled (§19.7.5). */
    signIn([
      'parties.party.read',
      'parties.party.write',
      'ledger.entry.read',
      'ledger.entry.write',
      'ledger.entry.correct',
    ]);
    ledgerService.listPartyEntries.mockResolvedValue(CEMENT_PAGE);
    partyService.getParty.mockResolvedValue({
      ...RESULT,
      party: { ...PARTY, status: 'archived' as const },
    });
    renderWithProviders(<PartyDetailPageContent id={ID} />);

    await screen.findByText('This party is archived');
    expect(await screen.findByText('Cement bags')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More actions for Cement bags' })
    ).not.toBeInTheDocument();
  });

  it('still offers them on an active party (the control above is not simply gone)', async () => {
    signIn([
      'parties.party.read',
      'parties.party.write',
      'ledger.entry.read',
      'ledger.entry.write',
      'ledger.entry.correct',
    ]);
    ledgerService.listPartyEntries.mockResolvedValue(CEMENT_PAGE);
    renderWithProviders(<PartyDetailPageContent id={ID} />);

    expect(
      await screen.findByRole('button', { name: 'More actions for Cement bags' })
    ).toBeInTheDocument();
  });
});

/* ── NEW-2 (QA retest, 24 Sep 2026) — the credit block and the totals ───── */

describe('after an entry, the credit block and the totals follow the balance (NEW-2)', () => {
  /**
   * NEW-2. After a save, only the header balance moved: `partyDetailSlice`
   * patched `balance` from `meta.party_balance` and nothing else, so the credit
   * block ("₹250.00 over the ₹1,000.00 limit", the bar) and the timeline's
   * "You gave in all" / "You got in all" kept the figures of the page load
   * until a reload. The credit bar is what a merchant reads before lending
   * more, and it was telling them about a balance that no longer existed.
   *
   * Both figures are the SERVER's — the credit block is computed with
   * `Decimal` in `GET /parties/{id}` and the totals are `meta.summary` on the
   * timeline's first page — so the fix is a refetch through the invalidation
   * map, and these tests assert the refetched figures reach the screen. The
   * header's instant patch is asserted to survive alongside it.
   */
  const LIMIT = '1000.00';
  const credit = (
    exposure: string,
    available: string,
    overBy: string,
    usagePct: number,
    status: 'ok' | 'near' | 'over'
  ) => ({ limit: LIMIT, days: 30, exposure, available, overBy, usagePct, mode: 'warn', status });

  const detail = (balance: string, creditBlock: ReturnType<typeof credit>) => ({
    party: { ...PARTY, balance, creditLimit: LIMIT },
    summary: { balance },
    credit: creditBlock,
  });

  const timeline = (
    totalDebit: string,
    totalCredit: string,
    rows: readonly Record<string, unknown>[] = [ENTRY]
  ) => ({
    rows,
    nextCursor: null,
    hasMore: false,
    summary: { totalDebit, totalCredit, entryCount: rows.length },
  });

  const ENTRY = {
    id: 'e0',
    partyId: ID,
    direction: 'debit' as const,
    amount: '1250.00',
    entryDate: '2026-09-15',
    entryType: 'manual_gave',
    sourceType: 'manual',
    sourceId: null,
    note: 'Cement bags',
    paymentMode: null,
    upiApp: null,
    reference: '',
    status: 'posted' as const,
    reversedById: null,
    reversesId: null,
    supersedesId: null,
    reason: null,
    createdBy: null,
    createdAt: '2026-09-15T10:00:00Z',
  };

  const posted = (id: string, direction: 'debit' | 'credit', amount: string) => ({
    ...ENTRY,
    id,
    direction,
    amount,
    note: '',
    entryType: direction === 'debit' ? 'manual_gave' : 'manual_got',
    entryDate: '2026-09-17',
    createdAt: '2026-09-17T10:00:00Z',
  });

  it('over the limit → further over: the caption and "You gave in all" move with the entry', async () => {
    partyService.getParty
      .mockResolvedValueOnce(detail('1250.00', credit('1250.00', '0.00', '250.00', 125, 'over')))
      .mockResolvedValue(detail('1450.00', credit('1450.00', '0.00', '450.00', 145, 'over')));
    ledgerService.listPartyEntries
      .mockResolvedValueOnce(timeline('1250.00', '0.00'))
      .mockResolvedValue(timeline('1450.00', '0.00', [posted('e1', 'debit', '200.00'), ENTRY]));
    ledgerService.postLedgerEntry.mockResolvedValue({
      entry: posted('e1', 'debit', '200.00'),
      balance: '1450.00',
      warnings: [],
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    expect(await screen.findByText('₹250.00 over the ₹1,000.00 limit')).toBeInTheDocument();
    expect(await screen.findByText('You gave in all, ₹1,250.00')).toBeInTheDocument();

    await act(async () => {
      await store.dispatch(
        postEntry({
          partyId: ID,
          idempotencyKey: 'k1',
          values: {
            direction: 'debit',
            amount: '200.00',
            entryDate: '2026-09-17',
            note: '',
            paymentMode: '',
            upiApp: '',
            reference: '',
          } as Parameters<typeof postEntry>[0]['values'],
        })
      );
    });

    expect(await screen.findByText('₹450.00 over the ₹1,000.00 limit')).toBeInTheDocument();
    expect(screen.queryByText('₹250.00 over the ₹1,000.00 limit')).not.toBeInTheDocument();
    expect(await screen.findByText('You gave in all, ₹1,450.00')).toBeInTheDocument();
  });

  it('under the limit → near it: the bar and the caption come from the server’s new block', async () => {
    partyService.getParty
      .mockResolvedValueOnce(detail('500.00', credit('500.00', '500.00', '0.00', 50, 'ok')))
      .mockResolvedValue(detail('750.00', credit('750.00', '250.00', '0.00', 75, 'near')));
    ledgerService.listPartyEntries
      .mockResolvedValueOnce(timeline('500.00', '0.00', [{ ...ENTRY, amount: '500.00' }]))
      .mockResolvedValue(
        timeline('750.00', '0.00', [
          posted('e1', 'debit', '250.00'),
          { ...ENTRY, amount: '500.00' },
        ])
      );
    ledgerService.postLedgerEntry.mockResolvedValue({
      entry: posted('e1', 'debit', '250.00'),
      balance: '750.00',
      warnings: [],
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    expect(await screen.findByText('₹500.00 left of ₹1,000.00')).toBeInTheDocument();

    await act(async () => {
      await store.dispatch(
        postEntry({
          partyId: ID,
          idempotencyKey: 'k2',
          values: {
            direction: 'debit',
            amount: '250.00',
            entryDate: '2026-09-17',
            note: '',
            paymentMode: '',
            upiApp: '',
            reference: '',
          } as Parameters<typeof postEntry>[0]['values'],
        })
      );
    });

    expect(await screen.findByText('₹250.00 left of ₹1,000.00')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: /Credit used — ₹250.00 left of ₹1,000.00/ })
    ).toHaveAttribute('aria-valuenow', '75');
    expect(await screen.findByText('You gave in all, ₹750.00')).toBeInTheDocument();
  });

  it('a reversal takes a party back under the limit, and "You gave in all" drops', async () => {
    /* The typo case LED-03 exists for: ₹400 written twice at a busy counter.
       Undoing it takes the party from ₹200 over to ₹200 left — the difference
       between refusing the next sale and making it. */
    const first = { ...ENTRY, amount: '800.00' };
    const duplicate = posted('e2', 'debit', '400.00');
    partyService.getParty
      .mockResolvedValueOnce(detail('1200.00', credit('1200.00', '0.00', '200.00', 120, 'over')))
      .mockResolvedValue(detail('800.00', credit('800.00', '200.00', '0.00', 80, 'near')));
    ledgerService.listPartyEntries
      .mockResolvedValueOnce(timeline('1200.00', '0.00', [duplicate, first]))
      .mockResolvedValue(timeline('800.00', '0.00', [first]));
    ledgerService.reverseLedgerEntry.mockResolvedValue({
      entry: { ...duplicate, id: 'rev', direction: 'credit', reversesId: 'e2', reason: 'Twice' },
      balance: '800.00',
      originalId: 'e2',
      reversalId: 'rev',
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    expect(await screen.findByText('₹200.00 over the ₹1,000.00 limit')).toBeInTheDocument();
    expect(await screen.findByText('You gave in all, ₹1,200.00')).toBeInTheDocument();

    await act(async () => {
      await store.dispatch(
        reverseEntry({
          entry: duplicate as Parameters<typeof reverseEntry>[0]['entry'],
          reason: 'Twice',
          idempotencyKey: 'k3',
        })
      );
    });

    expect(await screen.findByText('₹200.00 left of ₹1,000.00')).toBeInTheDocument();
    expect(screen.queryByText('₹200.00 over the ₹1,000.00 limit')).not.toBeInTheDocument();
    expect(await screen.findByText('You gave in all, ₹800.00')).toBeInTheDocument();
    // The header's instant patch is still there, and still the 200's figure.
    expect(screen.getAllByText('₹800.00').length).toBeGreaterThan(0);
  });

  const values = (amount: string) =>
    ({
      direction: 'debit',
      amount,
      entryDate: '2026-09-17',
      note: '',
      paymentMode: '',
      upiApp: '',
      reference: '',
    }) as Parameters<typeof postEntry>[0]['values'];

  it('two quick entries: the first one’s late refetch does not put its figures back', async () => {
    /* The refetch NEW-2 added has a failure the patch alone never had. Entry 1
       asks for the credit block; entry 2 lands before that answer does. The
       hook must ask AGAIN for entry 2 (it re-fires on `staleSeq`, aborting the
       first read), or the credit block stays on entry 1's figures — and without
       the slice's guard, the header's balance would go backwards to them. */
    let answerFirst: (value: unknown) => void = () => undefined;
    partyService.getParty
      .mockResolvedValueOnce(detail('1250.00', credit('1250.00', '0.00', '250.00', 125, 'over')))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answerFirst = resolve;
        })
      )
      .mockResolvedValue(detail('1650.00', credit('1650.00', '0.00', '650.00', 165, 'over')));
    ledgerService.listPartyEntries.mockResolvedValue(timeline('1250.00', '0.00'));
    ledgerService.postLedgerEntry
      .mockResolvedValueOnce({
        entry: posted('e1', 'debit', '200.00'),
        balance: '1450.00',
        warnings: [],
      })
      .mockResolvedValueOnce({
        entry: { ...posted('e2', 'debit', '200.00'), createdAt: '2026-09-17T10:00:05Z' },
        balance: '1650.00',
        warnings: [],
      });

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    expect(await screen.findByText('₹250.00 over the ₹1,000.00 limit')).toBeInTheDocument();

    await act(async () => {
      await store.dispatch(
        postEntry({ partyId: ID, idempotencyKey: 'a', values: values('200.00') })
      );
    });
    await waitFor(() => expect(partyService.getParty).toHaveBeenCalledTimes(2));
    await act(async () => {
      await store.dispatch(
        postEntry({ partyId: ID, idempotencyKey: 'b', values: values('200.00') })
      );
    });

    expect(await screen.findByText('₹650.00 over the ₹1,000.00 limit')).toBeInTheDocument();
    // Entry 1's read finally answers, with entry 1's figures. Nothing moves.
    await act(async () => {
      answerFirst(detail('1450.00', credit('1450.00', '0.00', '450.00', 145, 'over')));
      await Promise.resolve();
    });
    expect(screen.getByText('₹650.00 over the ₹1,000.00 limit')).toBeInTheDocument();
    expect(screen.queryByText('₹450.00 over the ₹1,000.00 limit')).not.toBeInTheDocument();
    expect(screen.getAllByText('₹1,650.00').length).toBeGreaterThan(0);
  });

  it('re-reads the timeline at the depth already loaded, not back to one page', async () => {
    /* The refresh is for the totals; it must not cost a merchant who had
       scrolled past the first fifty rows their place. */
    const many = Array.from({ length: 60 }, (_, index) => ({
      ...ENTRY,
      id: `old-${index}`,
      amount: '10.00',
      note: `Row ${index}`,
      createdAt: `2026-09-15T10:${String(index).padStart(2, '0')}:00Z`,
    }));
    partyService.getParty.mockResolvedValue(
      detail('600.00', credit('600.00', '400.00', '0.00', 60, 'ok'))
    );
    ledgerService.listPartyEntries.mockResolvedValue(timeline('600.00', '0.00', many));
    ledgerService.postLedgerEntry.mockResolvedValue({
      entry: posted('e1', 'debit', '200.00'),
      balance: '800.00',
      warnings: [],
    });

    renderWithProviders(<PartyDetailPageContent id={ID} />);
    expect(await screen.findByText('You gave in all, ₹600.00')).toBeInTheDocument();

    await act(async () => {
      await store.dispatch(
        postEntry({ partyId: ID, idempotencyKey: 'c', values: values('200.00') })
      );
    });

    await waitFor(() =>
      expect(ledgerService.listPartyEntries).toHaveBeenLastCalledWith(
        ID,
        expect.objectContaining({ limit: 61 }),
        expect.anything()
      )
    );
  });
});

/**
 * PRODUCT (owner-compatible): on a phone the header's You gave / You got pair
 * scrolls away with a long khata, and the merchant had to scroll back to the
 * top to record the next entry. The pair STAYS in the header — the owner's
 * tab-like pair under the title — and a docked copy appears at the bottom only
 * once the header pair is out of view.
 *
 * jsdom has no IntersectionObserver, so these install one the test drives:
 * `scrollPast(true)` reports the observed pair as having gone above the top
 * of the viewport, `scrollPast(false)` as back on screen.
 */
describe('the docked You gave / You got pair on a phone', () => {
  let observed: { callback: IntersectionObserverCallback; target: Element | null }[] = [];

  const scrollPast = (past: boolean): void => {
    act(() => {
      for (const entry of observed) {
        if (!entry.target) continue;
        entry.callback(
          [
            {
              isIntersecting: !past,
              target: entry.target,
              boundingClientRect: { top: past ? -80 : 120, bottom: past ? -40 : 160 },
              rootBounds: { top: 0, bottom: 640 },
            } as unknown as IntersectionObserverEntry,
          ],
          {} as IntersectionObserver
        );
      }
    });
  };

  beforeEach(() => {
    observed = [];
    class MockIntersectionObserver {
      private readonly record: { callback: IntersectionObserverCallback; target: Element | null };
      constructor(callback: IntersectionObserverCallback) {
        this.record = { callback, target: null };
        observed.push(this.record);
      }
      observe(target: Element): void {
        this.record.target = target;
      }
      disconnect(): void {
        this.record.target = null;
      }
      unobserve(): void {
        this.record.target = null;
      }
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      configurable: true,
      value: MockIntersectionObserver,
    });
    Object.defineProperty(global, 'IntersectionObserver', {
      writable: true,
      configurable: true,
      value: MockIntersectionObserver,
    });
  });

  afterEach(() => {
    // Leave jsdom as the rest of this file found it: no observer at all.
    delete (window as { IntersectionObserver?: unknown }).IntersectionObserver;
    delete (global as { IntersectionObserver?: unknown }).IntersectionObserver;
  });

  it('docks the pair at the bottom once the header pair has scrolled away, and not before', async () => {
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('₹2,300.00');
    await waitFor(() => expect(observed.some((entry) => entry.target)).toBe(true));

    // On screen: one pair, in the header, and no dock.
    expect(screen.queryByTestId('khata-dock')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /You gave/ })).toHaveLength(1);

    scrollPast(true);
    const dock = await screen.findByTestId('khata-dock');
    expect(dock).toHaveAttribute('data-ub-bottom-bar');
    // Phone only: from `sm` up the header pair sits beside the title.
    expect(dock).toHaveClass('sm:hidden');
    expect(within(dock).getByRole('button', { name: /You gave/ })).toBeInTheDocument();
    expect(within(dock).getByRole('button', { name: /You got/ })).toBeInTheDocument();

    scrollPast(false);
    await waitFor(() => expect(screen.queryByTestId('khata-dock')).not.toBeInTheDocument());
  });

  it('opens the entry drawer in the direction of the docked button pressed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('₹2,300.00');
    await waitFor(() => expect(observed.some((entry) => entry.target)).toBe(true));
    scrollPast(true);

    const dock = await screen.findByTestId('khata-dock');
    await user.click(within(dock).getByRole('button', { name: /You got/ }));

    await screen.findByLabelText('Amount');
    expect(screen.getByRole('radio', { name: /You got/ })).toBeChecked();
  });

  it('is not offered for an archived party', async () => {
    partyService.getParty.mockResolvedValue({
      ...RESULT,
      party: { ...PARTY, status: 'archived' as const },
    });
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');
    scrollPast(true);

    expect(screen.queryByTestId('khata-dock')).not.toBeInTheDocument();
  });

  it('is not offered to a role that cannot write entries', async () => {
    signIn(['parties.party.read', 'ledger.entry.read']);
    renderWithProviders(<PartyDetailPageContent id={ID} />);
    await screen.findByText('Ramesh Traders');
    scrollPast(true);

    expect(screen.queryByTestId('khata-dock')).not.toBeInTheDocument();
  });
});
