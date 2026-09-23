import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { resetLedgerEntries } from '../redux/ledgerEntrySlice';
import { resetLedgerForm } from '../redux/ledgerFormSlice';

import { PartyLedgerTimeline } from './PartyLedgerTimeline';

/**
 * LED-01's timeline — the khata a merchant reads.
 *
 * The assertions here are mostly about WORDS and ORDER, because both are things
 * a merchant reads out loud at a counter: which way round an entry went, whose
 * it was, and which day it belongs to.
 */
jest.mock('../api/ledgerService');

const ledgerService = jest.requireMock('../api/ledgerService') as {
  listPartyEntries: jest.Mock;
  postLedgerEntry: jest.Mock;
};

const PARTY_ID = '11111111-1111-4111-8111-111111111111';

const entry = (over: Record<string, unknown> = {}) => ({
  id: `e${Math.random()}`,
  partyId: PARTY_ID,
  direction: 'debit' as const,
  amount: '500.00',
  entryDate: '2026-09-17',
  entryType: 'manual_gave' as const,
  sourceType: 'manual' as const,
  sourceId: null,
  note: '',
  paymentMode: null,
  reference: '',
  status: 'posted' as const,
  reversedById: null,
  reversesId: null,
  supersedesId: null,
  reason: null,
  createdBy: { id: 'u1', name: 'Owner' },
  createdAt: '2026-09-17T10:00:00Z',
  ...over,
});

const page = (rows: unknown[], over: Record<string, unknown> = {}) => ({
  rows,
  nextCursor: null,
  hasMore: false,
  summary: { totalDebit: '500.00', totalCredit: '0.00', entryCount: rows.length },
  ...over,
});

const signIn = (permissions: string[], modules: string[] = ['parties', 'ledger']): void => {
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
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata', role: 'owner' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata', role: 'owner' }],
      permissions: permissions as never,
      enabledModules: modules as never,
      version: 1,
    })
  );
};

beforeEach(() => {
  store.dispatch(resetLedgerEntries());
  store.dispatch(resetLedgerForm());
  jest.clearAllMocks();
  ledgerService.listPartyEntries.mockResolvedValue(page([entry()]));
  signIn(['ledger.entry.read', 'ledger.entry.write']);
});

describe('the khata timeline', () => {
  it('says which way each entry went, in words and not only in colour', async () => {
    /**
     * §23.2.6 rule 3 and WCAG 2.2 both. Red and green carry the direction at a
     * glance, and the words carry it for the merchant who cannot tell them
     * apart — and for the one reading a photocopy.
     */
    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    // Once on the row, and once as the running total above it — the second
    // occurrence is `You gave in all`, which is why this counts rather than
    // asserting a single match.
    expect(await screen.findByText('You gave')).toBeInTheDocument();
    expect(screen.getAllByText('₹500.00')).toHaveLength(2);
    /* The label is in the accessible name even where it is not painted, so a
       screen reader still hears which way the money went. `UbAmount` puts it in
       an `sr-only` span as "<label>, <amount>" rather than on an aria-label —
       the visible figure is `aria-hidden`, because "minus five hundred rupees"
       is not how the number is read in the shop. */
    expect(screen.getByText('You gave, ₹500.00')).toBeInTheDocument();
  });

  it('never shows an entry amount with a sign', async () => {
    /**
     * The amount column carries no sign because direction is a column, and a
     * negative is not a concept a shopkeeper has. The same rule that made
     * `UbAmount` render "₹282.90 · You will give" rather than "−₹282.90".
     */
    ledgerService.listPartyEntries.mockResolvedValue(
      page([entry({ direction: 'credit', paymentMode: 'upi' })])
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    await screen.findByText('You got');
    expect(screen.queryByText(/[-−]₹/)).not.toBeInTheDocument();
  });

  it('shows the merchant’s own note rather than a category word', async () => {
    ledgerService.listPartyEntries.mockResolvedValue(
      page([entry({ note: 'Sugar 10 kg' })])
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    expect(await screen.findByText('Sugar 10 kg')).toBeInTheDocument();
  });

  it('names the author only when it was somebody else', async () => {
    /**
     * FR-8. A khata where every line says "by Sunita" is a khata where the one
     * line Ramesh wrote does not stand out — which is the only reason to print
     * an author at all.
     */
    ledgerService.listPartyEntries.mockResolvedValue(
      page([
        entry({ id: 'mine', createdBy: { id: 'u1', name: 'Owner' }, note: 'Mine' }),
        entry({ id: 'theirs', createdBy: { id: 'u2', name: 'Sunita' }, note: 'Theirs' }),
      ])
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    await screen.findByText('Mine');
    expect(screen.getByText('by Sunita')).toBeInTheDocument();
    expect(screen.queryByText('by Owner')).not.toBeInTheDocument();
  });

  it('puts the mode and reference under a payment', async () => {
    ledgerService.listPartyEntries.mockResolvedValue(
      page([entry({ direction: 'credit', paymentMode: 'upi', reference: 'UTR123' })])
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    expect(await screen.findByText(/UPI · UTR123/)).toBeInTheDocument();
  });

  it('leaves no stray separator when there is nothing to separate', async () => {
    /**
     * Three optional fragments joined in a template literal is how a row ends
     * up reading "· · by Sunita". `entryCaption` assembles the list first and
     * joins what is left.
     */
    ledgerService.listPartyEntries.mockResolvedValue(
      page([entry({ note: 'Sugar', createdBy: { id: 'u1', name: 'Owner' } })])
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    await screen.findByText('Sugar');
    expect(screen.queryByText(/^\s*·/)).not.toBeInTheDocument();
  });

  it('groups by the day the thing happened, not the day it was typed', async () => {
    /**
     * BR-5. A merchant reads a khata by day, and a backdated entry belongs
     * under the day it happened — which is also why it carries a tag, so
     * somebody who just saved one and cannot find it at the top knows to look
     * further down.
     */
    ledgerService.listPartyEntries.mockResolvedValue(
      page([
        entry({ id: 'today', entryDate: '2026-09-17', createdAt: '2026-09-17T09:00:00Z' }),
        entry({
          id: 'old',
          entryDate: '2026-09-10',
          createdAt: '2026-09-17T09:05:00Z',
          note: 'Forgot this one',
        }),
      ])
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    await screen.findByText('Forgot this one');
    expect(screen.getByText('17/09/2026')).toBeInTheDocument();
    expect(screen.getByText('10/09/2026')).toBeInTheDocument();
    expect(screen.getByText('Backdated')).toBeInTheDocument();
  });

  it('does not call an entry backdated for being written the next morning', async () => {
    /**
     * One day of slack. An entry made just after midnight for the evening that
     * has only formally ended is not backdated in any sense a merchant would
     * recognise, and a tag on every one of them is a tag that means nothing.
     */
    ledgerService.listPartyEntries.mockResolvedValue(
      page([entry({ entryDate: '2026-09-17', createdAt: '2026-09-18T06:00:00Z' })])
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    await screen.findByText('You gave');
    expect(screen.queryByText('Backdated')).not.toBeInTheDocument();
  });

  it('shows the two running totals only when there is something to total', async () => {
    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    expect(await screen.findByText('You gave in all')).toBeInTheDocument();

    store.dispatch(resetLedgerEntries());
    ledgerService.listPartyEntries.mockResolvedValue(
      page([], { summary: { totalDebit: '0.00', totalCredit: '0.00', entryCount: 0 } })
    );
    const view = renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);
    view.unmount();
  });

  it('shows a write-off as its own figure, not inside "You got in all"', async () => {
    /* CR-2026-09-24-A, the QA defect: after a write-off the header read
       "You got in all ₹930.00" over a row saying "Written off". The server now
       reports gave and got WITHOUT write-offs, and the forgiven amount is a
       third line — so the header adds up the way a merchant checks it:
       2,800 − 300 − 2,500 = 0. */
    ledgerService.listPartyEntries.mockResolvedValue(
      page(
        [
          entry({
            direction: 'credit',
            entryType: 'write_off',
            amount: '2500.00',
            note: 'Shop closed',
            reason: 'Shop closed',
          }),
        ],
        {
          summary: {
            totalDebit: '2800.00',
            totalCredit: '300.00',
            writtenOff: { debit: '0.00', credit: '2500.00' },
            entryCount: 4,
          },
        }
      )
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    expect(await screen.findByText('Written off in all')).toBeInTheDocument();
    expect(screen.getByText('Written off in all, ₹2,500.00')).toBeInTheDocument();
    expect(screen.getByText('You got in all, ₹300.00')).toBeInTheDocument();
    expect(screen.getByText('You gave in all, ₹2,800.00')).toBeInTheDocument();
  });

  it('draws no written-off line for a khata nobody has forgiven', async () => {
    ledgerService.listPartyEntries.mockResolvedValue(
      page([entry()], {
        summary: {
          totalDebit: '500.00',
          totalCredit: '0.00',
          writtenOff: { debit: '0.00', credit: '0.00' },
          entryCount: 1,
        },
      })
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    expect(await screen.findByText('You gave in all')).toBeInTheDocument();
    expect(screen.queryByText(/Written off in all/)).not.toBeInTheDocument();
  });

  it('names each side when a party has both kinds of write-off', async () => {
    ledgerService.listPartyEntries.mockResolvedValue(
      page([entry()], {
        summary: {
          totalDebit: '500.00',
          totalCredit: '0.00',
          writtenOff: { debit: '35.00', credit: '20.00' },
          entryCount: 3,
        },
      })
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    expect(await screen.findByText('Written off in all (to get)')).toBeInTheDocument();
    expect(screen.getByText('Written off in all (to give)')).toBeInTheDocument();
  });

  it('tells a merchant with an empty khata what to do about it', async () => {
    ledgerService.listPartyEntries.mockResolvedValue(
      page([], { summary: { totalDebit: '0.00', totalCredit: '0.00', entryCount: 0 } })
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument();
    expect(
      screen.getByText('Record what you gave or got and it will appear here.')
    ).toBeInTheDocument();
    // And no "You gave in all ₹0.00" above it — two lines of nothing over an
    // empty state that already says the same thing.
    expect(screen.queryByText('You gave in all')).not.toBeInTheDocument();
  });

  it('offers older entries rather than loading a three-year history at once', async () => {
    const user = userEvent.setup();
    ledgerService.listPartyEntries.mockResolvedValueOnce(
      page([entry({ id: 'first', note: 'Newest' })], { nextCursor: 'cur1', hasMore: true })
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);
    await screen.findByText('Newest');

    ledgerService.listPartyEntries.mockResolvedValueOnce(
      page([entry({ id: 'second', note: 'Older', entryDate: '2026-09-01' })], {
        nextCursor: null,
        hasMore: false,
        summary: undefined,
      })
    );
    await user.click(screen.getByRole('button', { name: 'Show older entries' }));

    expect(await screen.findByText('Older')).toBeInTheDocument();
    // The first page is still there: "load more" appends, it does not replace.
    expect(screen.getByText('Newest')).toBeInTheDocument();
    // And the header figures the first page carried survive a response that
    // omits them — writing that `null` in would blank what the merchant is
    // reading.
    expect(screen.getByText('You gave in all')).toBeInTheDocument();
  });

  it('offers a way back when the timeline will not load', async () => {
    ledgerService.listPartyEntries.mockRejectedValue({
      code: 'server_error',
      message: 'Something went wrong.',
      details: {},
      requestId: 'req_abc123',
      status: 500,
      warnings: [],
    });

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    expect(await screen.findByText('Could not load the transactions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    // R-E-4 — the reference an operator can trace, on the screen rather than in
    // a console the merchant will never open.
    expect(screen.getByText(/req_abc123/)).toBeInTheDocument();
  });

  it('renders nothing at all for a tenant without the ledger module', async () => {
    signIn(['ledger.entry.read'], ['parties']);

    const { container } = renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    await waitFor(() => expect(ledgerService.listPartyEntries).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a role that may not read entries', async () => {
    signIn(['parties.party.read']);

    const { container } = renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    await waitFor(() => expect(ledgerService.listPartyEntries).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the opening balance row', () => {
  const opening = (over: Record<string, unknown> = {}) =>
    entry({
      id: 'op',
      entryType: 'opening',
      note: 'Opening balance',
      entryDate: '2026-04-01',
      amount: '2300.00',
      ...over,
    });

  it('says what it is in the merchant’s language, not in the server’s', async () => {
    /**
     * LED-02 BR-1 stores the note "Opening balance" in ENGLISH, so a report, an
     * export or a support query can find the row. The client knows an opening
     * by its `entry_type` and prints its own label — reading the note first put
     * a hard-coded English string on a Hindi khata, on the first row of every
     * book migrated from paper.
     */
    ledgerService.listPartyEntries.mockResolvedValue(page([opening()]));

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    expect(await screen.findByText('Opening balance')).toBeInTheDocument();
    expect(screen.getByText('Opening')).toBeInTheDocument();
  });

  it('does not also call it backdated', async () => {
    /**
     * An opening is dated when the old book started and written down today, so
     * it is backdated by definition. A tag on every one of them is a tag that
     * means nothing.
     */
    ledgerService.listPartyEntries.mockResolvedValue(
      page([opening({ createdAt: '2026-09-23T10:00:00Z' })])
    );

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    await screen.findByText('Opening balance');
    expect(screen.queryByText('Backdated')).not.toBeInTheDocument();
  });

  it('puts every badge where the caption would be, not beside the title', async () => {
    /**
     * Prevents two, and the second one happened AFTER the first was fixed.
     *
     *   · "Opening… [Opening] ₹2,300.00" on a 360 px phone — a badge repeating
     *     the word it had just truncated. LED-02 moved that one badge down.
     *   · "Opening bala… ⋯" — the same row again once LED-03 put a ⋯ in the
     *     trailing slot, and with corrections shown, a note squeezed to a
     *     single apostrophe-wide sliver between two badges and an amount.
     *
     * So the title now has the LINE to itself and every badge sits with the
     * caption. jsdom has no layout, so this asserts the STRUCTURE that makes
     * the width work: the title and the badge are on different lines, which is
     * to say they do not share a parent. `e2e/ledger.mjs` measures the pixels.
     */
    ledgerService.listPartyEntries.mockResolvedValue(page([opening()]));

    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    const title = await screen.findByText('Opening balance');
    const badge = screen.getByText('Opening');
    /* Asserted from the BADGE's side. The two share the left column — they are
       both in it, one line under the other — so "the title's parent does not
       contain the badge" stopped being true the moment the title got a line of
       its own, while the thing it was guarding stayed exactly as broken. The
       rule is that the badge's LINE does not hold the title. */
    expect(badge.parentElement).not.toBe(title.parentElement);
    expect(badge.parentElement?.contains(title)).toBe(false);
  });
});

/**
 * LED-03 on the timeline — what the merchant can reach, and what they are told.
 *
 * The permission is the first assertion in every one of these, because the
 * whole feature hangs off it: staff work the counter and must not be offered a
 * control that changes a number a customer has already been shown.
 */
describe('correcting from the khata', () => {
  const CORRECT = ['ledger.entry.read', 'ledger.entry.write', 'ledger.entry.correct'];

  it('offers no ⋯ to somebody who may not correct', async () => {
    /* BR-8, and hidden rather than disabled: a merchant who taps a control that
       refuses them has learned nothing except that the app is unpredictable. */
    signIn(['ledger.entry.read', 'ledger.entry.write']);
    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    await screen.findByText('You gave');
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Show corrections')).not.toBeInTheDocument();
  });

  it('offers it on a manual entry and names the row in the label', async () => {
    /* Icon-only, because a worded button on a khata row pushes the amount off a
       360 px phone — the defect this feature's own sweep caught in the header.
       The label still names the row, so somebody navigating by control is not
       offered fifty buttons all called "More actions". */
    signIn(CORRECT);
    ledgerService.listPartyEntries.mockResolvedValue(page([entry({ note: 'Cement bags' })]));
    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    expect(
      await screen.findByRole('button', { name: 'More actions for Cement bags' })
    ).toBeInTheDocument();
  });

  it('offers nothing on a row an invoice posted', async () => {
    /* BR-6. Undoing the ledger line without touching the document would leave
       the invoice saying one thing and the khata another. */
    signIn(CORRECT);
    ledgerService.listPartyEntries.mockResolvedValue(
      page([entry({ sourceType: 'sales_document', entryType: 'invoice', note: 'INV-4' })])
    );
    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    await screen.findByText('INV-4');
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
  });

  it('opens the two choices and says the original stays either way', async () => {
    /* Said once, in the menu, rather than in both dialogs: a merchant who
       expects a delete and gets a strike-through would otherwise find out by
       seeing it. */
    signIn(CORRECT);
    ledgerService.listPartyEntries.mockResolvedValue(page([entry({ note: 'Cement bags' })]));
    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'More actions for Cement bags' })
    );

    expect(await screen.findByText('Correct this entry')).toBeInTheDocument();
    expect(screen.getByText('Reverse this entry')).toBeInTheDocument();
    expect(screen.getByText(/stays in the book/)).toBeInTheDocument();
  });

  it('refetches with the struck-through rows when corrections are shown', async () => {
    /* FR-7, and the request is the assertion. A switch that flips a flag and
       filters what is already held would be wrong in both directions: the
       reversed rows were never downloaded, and hiding them from a page of fifty
       would show thirty while still claiming there was more.

       `e2e/parties.mjs` exists because of a defect exactly this shape — chips
       that lit up and issued no request at all. */
    signIn(CORRECT);
    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    await screen.findByText('You gave');
    await userEvent.click(screen.getByRole('switch', { name: 'Show corrections' }));

    await waitFor(() =>
      expect(ledgerService.listPartyEntries).toHaveBeenCalledWith(
        PARTY_ID,
        expect.objectContaining({ includeReversed: true }),
        expect.anything()
      )
    );
  });

  it('tells a corrected row apart from one that was simply reversed', async () => {
    /* Both are struck through, and they are not the same event: "Corrected"
       says a replacement is standing somewhere in this khata, "Reversed" says
       the money simply came back out. A merchant at a dispute needs to know
       which. */
    signIn(CORRECT);
    ledgerService.listPartyEntries.mockResolvedValue(
      page([
        entry({ id: 'replacement', amount: '550.00', supersedesId: 'original', note: 'Cement' }),
        entry({ id: 'original', status: 'reversed', note: 'Cement' }),
        entry({ id: 'undone', status: 'reversed', note: 'Sand' }),
      ])
    );
    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} />);

    expect(await screen.findByText('Corrected')).toBeInTheDocument();
    expect(screen.getByText('Reversed')).toBeInTheDocument();
  });
});

describe('an archived party’s khata (QA O4)', () => {
  it('offers no Correct / Reverse on a row when the khata is read-only', async () => {
    /* Prevents QA O4: an ARCHIVED party's rows still offered "Correct this
       entry / Reverse this entry", and the server refuses both (409
       party_archived). Hidden rather than disabled (§19.7.5) — the same rule
       as the header's You gave / You got on that page. */
    signIn(['ledger.entry.read', 'ledger.entry.write', 'ledger.entry.correct']);
    ledgerService.listPartyEntries.mockResolvedValue(page([entry({ note: 'Cement bags' })]));
    renderWithProviders(<PartyLedgerTimeline partyId={PARTY_ID} readOnly />);

    await screen.findByText('Cement bags');
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
  });
});
