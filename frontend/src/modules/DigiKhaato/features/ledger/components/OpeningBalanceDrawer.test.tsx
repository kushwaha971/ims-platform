import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { en, hi } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import { todayInTenantTz } from 'src/utils/dates';

import { useOpeningBalance } from '../hooks/useOpeningBalance';
import { ledgerTimelineOpened, resetLedgerEntries } from '../redux/ledgerEntrySlice';
import { fetchPartyEntries } from '../redux/ledgerEntryThunk';
import { resetLedgerForm } from '../redux/ledgerFormSlice';

import { OpeningBalanceDrawer } from './OpeningBalanceDrawer';

import type { LedgerDirection, LedgerEntry } from '../types/ledger.types';

/**
 * LED-02's drawer — the second door onto an opening balance, and in practice
 * the one that gets used: nobody types forty customers' balances in one sitting
 * while creating the parties, so most openings are added afterwards.
 */
jest.mock('../api/ledgerService');

const ledgerService = jest.requireMock('../api/ledgerService') as {
  listPartyEntries: jest.Mock;
  postLedgerEntry: jest.Mock;
  postOpeningBalance: jest.Mock;
};

const PARTY_ID = '11111111-1111-4111-8111-111111111111';

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e1',
  partyId: PARTY_ID,
  direction: 'debit',
  amount: '2300.00',
  entryDate: '2026-04-01',
  entryType: 'opening',
  sourceType: 'manual',
  sourceId: null,
  note: 'Opening balance',
  paymentMode: null,
  upiApp: null,
  reference: '',
  status: 'posted',
  reversedById: null,
  reversesId: null,
  supersedesId: null,
  reason: null,
  createdBy: null,
  createdAt: '2026-09-23T10:00:00Z',
  ...over,
});

const apiError = (code: string, details: Record<string, unknown> = {}) => ({
  code,
  message: 'This party already has an opening balance. Correct it from the entry instead.',
  details,
  requestId: 'req_abc',
  status: code === 'validation_error' ? 400 : 409,
  warnings: [],
});

const signIn = (permissions: string[]): void => {
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
      enabledModules: ['parties', 'ledger'],
      version: 1,
    })
  );
};

/** The page's job, reduced to what the drawer needs. */
function Harness({
  direction = 'debit',
  onResult,
}: Readonly<{
  direction?: LedgerDirection;
  onResult?: (r: ReturnType<typeof useOpeningBalance>) => void;
}>): React.JSX.Element | null {
  const opening = useOpeningBalance(PARTY_ID);
  onResult?.(opening);
  if (!opening.open) return null;
  return (
    <OpeningBalanceDrawer
      opening={opening}
      partyName="Ramesh Traders"
      defaultDirection={direction}
    />
  );
}

/** Put the timeline into the state a loaded khata is in. */
const loadTimeline = async (rows: LedgerEntry[] = []): Promise<void> => {
  store.dispatch(ledgerTimelineOpened(PARTY_ID));
  store.dispatch({
    type: fetchPartyEntries.fulfilled.type,
    payload: {
      rows,
      nextCursor: null,
      hasMore: false,
      summary: { totalDebit: '0.00', totalCredit: '0.00', entryCount: rows.length },
    },
    meta: { arg: { partyId: PARTY_ID }, requestId: 'r', requestStatus: 'fulfilled' },
  });
};

beforeEach(async () => {
  store.dispatch(resetLedgerEntries());
  store.dispatch(resetLedgerForm());
  jest.clearAllMocks();
  ledgerService.postOpeningBalance.mockResolvedValue({
    entry: entry(),
    balance: '2300.00',
    warnings: [],
  });
  signIn(['ledger.entry.read', 'ledger.entry.write', 'parties.party.write']);
  await loadTimeline();
});

describe('whether the action is offered at all', () => {
  it('is offered on a khata that has no opening', () => {
    let result: ReturnType<typeof useOpeningBalance> | undefined;
    renderWithProviders(
      <Harness
        onResult={(r) => {
          result = r;
        }}
      />
    );

    expect(result?.canAdd).toBe(true);
  });

  it('is not offered once one exists', async () => {
    /** FR-3 / §9 — hidden, not disabled. A merchant who taps a control that
     *  refuses them has learned nothing except that the app is unpredictable. */
    await loadTimeline([entry()]);
    let result: ReturnType<typeof useOpeningBalance> | undefined;
    renderWithProviders(
      <Harness
        onResult={(r) => {
          result = r;
        }}
      />
    );

    expect(result?.canAdd).toBe(false);
    expect(result?.existing?.id).toBe('e1');
  });

  it('comes back when the opening was reversed', async () => {
    /**
     * BR-5. A reversal alone leaves the party with no opening — which is right:
     * the merchant undid the figure and now has none. A reversed opening is
     * history, not an opening.
     */
    await loadTimeline([entry({ status: 'reversed' })]);
    let result: ReturnType<typeof useOpeningBalance> | undefined;
    renderWithProviders(
      <Harness
        onResult={(r) => {
          result = r;
        }}
      />
    );

    expect(result?.canAdd).toBe(true);
    expect(result?.existing).toBeNull();
  });

  it('waits for the timeline before offering it', async () => {
    /**
     * Prevents: the action flashing for a second on a party that already HAS an
     * opening, because the rows had not arrived yet. A merchant who taps it in
     * that second gets a 409 for a rule they could not have known about.
     */
    store.dispatch(resetLedgerEntries());
    store.dispatch(ledgerTimelineOpened(PARTY_ID));
    let result: ReturnType<typeof useOpeningBalance> | undefined;
    renderWithProviders(
      <Harness
        onResult={(r) => {
          result = r;
        }}
      />
    );

    expect(result?.canAdd).toBe(false);
  });

  it('is not offered to a role that may write entries but not parties', async () => {
    /** §12 — posting an opening needs BOTH rights, because it is a ledger write
     *  AND part of setting a party up. PTY-01's form lists the same pair. */
    signIn(['ledger.entry.read', 'ledger.entry.write']);
    await loadTimeline();
    let result: ReturnType<typeof useOpeningBalance> | undefined;
    renderWithProviders(
      <Harness
        onResult={(r) => {
          result = r;
        }}
      />
    );

    expect(result?.canAdd).toBe(false);
  });
});

describe('the drawer', () => {
  const open = async (direction: LedgerDirection = 'debit') => {
    let result: ReturnType<typeof useOpeningBalance> | undefined;
    const view = renderWithProviders(
      <Harness
        direction={direction}
        onResult={(r) => {
          result = r;
        }}
      />
    );
    result?.openDrawer();
    view.rerender(
      <Harness
        direction={direction}
        onResult={(r) => {
          result = r;
        }}
      />
    );
    await screen.findByText('Ramesh Traders');
    return view;
  };

  it('starts on today and asks when the debt began, with the year start one tap away (UAT D6)', async () => {
    /**
     * CR-LOG D6. FR-1's default was the first day of the financial year, and on
     * any day but 1 April that ASSERTS an age the merchant never gave: aging
     * counts an opening from its date (LED-09 BR-4, FIFO by `entry_date`), so a
     * balance typed in today sat in "90+ days" on day one while the Overdue
     * chip beside it was empty. Today claims nothing; the hint asks the
     * question only the merchant can answer, and the year start stays a chip.
     */
    await open();

    const asOf = await screen.findByRole('button', { name: /As of/ });
    expect(asOf).not.toHaveTextContent(/1 Apr \d{4}/);
    expect(screen.getByText('When did they start owing this?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Year start' })).toBeInTheDocument();
  });

  it('names the year-start chip exactly as the party form does, in both languages (D-L4)', () => {
    /* Prevents D-L4: the same chip — the same date, the same tap — read
       "FY start" here and "Year start" on the party form's opening section,
       so a merchant met two names for one thing a screen apart. The two keys
       are separate because the screens are; this keeps their words in step. */
    const messages = [en, hi] as ReadonlyArray<Record<string, string>>;
    messages.forEach((locale) => {
      expect(locale['ledger.opening.fyStart']).toBe(locale['parties.form.opening.fyStart']);
    });
    expect(en['ledger.opening.fyStart']).toBe('Year start');
  });

  it('still sends the year start when the merchant picks it', async () => {
    /** The migrating merchant FR-1 was written for loses nothing: one tap. */
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Amount'), '2300');
    await user.click(screen.getByRole('button', { name: 'Year start' }));
    await user.click(screen.getByRole('button', { name: 'Save opening balance' }));

    await waitFor(() => expect(ledgerService.postOpeningBalance).toHaveBeenCalled());
    expect(ledgerService.postOpeningBalance.mock.calls[0][1].asOf).toMatch(/-04-01$/);
  });

  it('does not label a field with the name of the drawer it is in', async () => {
    /**
     * Prevents: "Opening balance" as both the dialog's title and the amount
     * field's label. It reads as a repetition on screen and it is worse than
     * that for anybody navigating by label — two different things answering to
     * one name, in the same dialog.
     */
    await open();

    expect(screen.getAllByText('Opening balance')).toHaveLength(1);
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
  });

  it('starts a supplier-only party on "I owe them"', async () => {
    /** §8 / PTY-01 FR-9. A supplier is somebody this business buys FROM, so
     *  what is carried over is what the business owes them. */
    await open('credit');

    expect(await screen.findByRole('radio', { name: 'I owe them' })).toBeChecked();
  });

  it('says the whole sentence back, with the amount in it', async () => {
    /**
     * §8's direction hint, and it is the one place the merchant can check that
     * they understood the question. Getting it wrong is SILENT: an opening on
     * the wrong side is a khata that says a customer owes money to a shopkeeper
     * who in fact owes it to them, and nothing later contradicts it.
     */
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Amount'), '2300');
    await user.tab();

    expect(await screen.findByText('You will get ₹2,300.00')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'I owe them' }));

    expect(await screen.findByText('You will give ₹2,300.00')).toBeInTheDocument();
  });

  it('groups the hint even above a thousand', async () => {
    /**
     * `UbMoneyInput` groups on blur, so the watched value is "10,000.00" and a
     * formatter handed that produces nonsense. PTY-06's credit-limit hint
     * learned this the expensive way: it worked for every figure under ₹1,000
     * and silently stopped above it, which is the range every real opening
     * balance is in.
     */
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Amount'), '10000');
    await user.tab();

    expect(await screen.findByText('You will get ₹10,000.00')).toBeInTheDocument();
    expect(screen.queryByText(/₹₹/)).not.toBeInTheDocument();
  });

  it('sends what the merchant typed, as an opening', async () => {
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Amount'), '2300');
    await user.click(screen.getByRole('button', { name: 'Save opening balance' }));

    await waitFor(() => expect(ledgerService.postOpeningBalance).toHaveBeenCalled());
    const [partyId, values, key] = ledgerService.postOpeningBalance.mock.calls[0];
    expect(partyId).toBe(PARTY_ID);
    expect(values).toMatchObject({ amount: '2300.00', direction: 'debit' });
    // D6 — today in the TENANT's timezone, the drawer's own `max`.
    expect(values.asOf).toBe(todayInTenantTz('Asia/Kolkata'));
    expect(key).toBeTruthy();
  });

  it('will not save nothing', async () => {
    /** EC-3 — a ₹0.00 opening is "no opening", and a merchant who meant that
     *  should leave the section alone rather than get a meaningless row. */
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole('button', { name: 'Save opening balance' }));

    await waitFor(() => expect(ledgerService.postOpeningBalance).not.toHaveBeenCalled());
  });

  it('says so in place when somebody else got there first', async () => {
    /**
     * BR-2 through a real race: two tabs, or a colleague on another phone. It
     * is the one refusal in this feature a merchant can hit without doing
     * anything wrong, so it belongs above the form they are looking at rather
     * than in a toast over a drawer that is closing.
     */
    ledgerService.postOpeningBalance.mockRejectedValue(apiError('opening_balance_exists'));
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Amount'), '2300');
    await user.click(screen.getByRole('button', { name: 'Save opening balance' }));

    expect(await screen.findByText(/already has an opening balance/)).toBeInTheDocument();
  });

  it('anchors a server date error on the date field the merchant can fix', async () => {
    /** The server calls it `entry_date`; the form calls it `asOf`. A message
     *  that reaches neither is a message the merchant never sees. */
    ledgerService.postOpeningBalance.mockRejectedValue(
      apiError('validation_error', { entry_date: ['The date cannot be in the future.'] })
    );
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Amount'), '2300');
    await user.click(screen.getByRole('button', { name: 'Save opening balance' }));

    expect(await screen.findByText('The date cannot be in the future.')).toBeInTheDocument();
  });

  it('tells the merchant the balance in grouped rupees', async () => {
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Amount'), '2300');
    await user.click(screen.getByRole('button', { name: 'Save opening balance' }));

    await waitFor(() => expect(store.getState().snackbar.id).toBe('ledger.opening.saved'));
    expect(store.getState().snackbar.params).toEqual({ balance: '2,300.00' });
  });
});
