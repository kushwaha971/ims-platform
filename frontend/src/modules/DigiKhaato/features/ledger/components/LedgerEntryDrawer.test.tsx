import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { useLedgerEntryForm } from '../hooks/useLedgerEntryForm';
import { resetLedgerEntries } from '../redux/ledgerEntrySlice';
import { entryDrawerOpened, resetLedgerForm } from '../redux/ledgerFormSlice';

import { LedgerEntryDrawer } from './LedgerEntryDrawer';

/**
 * LED-01's drawer — the most frequent screen in the product, end to end inside
 * the client: component → hook → thunk → service, service stubbed at the module
 * boundary (§19.13.3).
 *
 * The assertions worth reading twice are the ones about what survives. A save
 * that fails on a bad connection must not cost the merchant what they typed
 * (FR-12), a direction switch must not either (FR-4, EC-9), and a retry must
 * reuse the idempotency key (AC-6) — all three are about state between two
 * moments, which is the kind of thing that quietly stops being true.
 */
jest.mock('../api/ledgerService');

const ledgerService = jest.requireMock('../api/ledgerService') as {
  listPartyEntries: jest.Mock;
  postLedgerEntry: jest.Mock;
};

const PARTY_ID = '11111111-1111-4111-8111-111111111111';

const ENTRY = {
  id: 'e1',
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
};

const apiError = (code: string, details: Record<string, unknown> = {}) => ({
  code,
  message: 'Refused.',
  details,
  requestId: 'req_abc',
  status: code === 'validation_error' ? 400 : 409,
  warnings: [],
});

const signIn = (role: string, permissions: string[]): void => {
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
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata', role },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata', role }],
      permissions: permissions as never,
      enabledModules: ['parties', 'ledger'],
      version: 1,
    })
  );
};

/** The page's job, reduced to the two lines that matter to the drawer. */
function Harness(): React.JSX.Element | null {
  const form = useLedgerEntryForm();
  if (!form.open) return null;
  return <LedgerEntryDrawer form={form} partyName="Ramesh Traders" />;
}

const openDrawer = (direction: 'debit' | 'credit' = 'debit'): void => {
  store.dispatch(entryDrawerOpened({ partyId: PARTY_ID, direction }));
};

beforeEach(() => {
  store.dispatch(resetLedgerForm());
  store.dispatch(resetLedgerEntries());
  jest.clearAllMocks();
  window.localStorage.clear();
  ledgerService.postLedgerEntry.mockResolvedValue({
    entry: ENTRY,
    balance: '2800.00',
    warnings: [],
  });
  signIn('owner', ['ledger.entry.read', 'ledger.entry.write']);
});

describe('the entry drawer', () => {
  it('says whose khata it is about, in the merchant’s own words', async () => {
    /**
     * The one thing that stops an entry being written against the wrong person.
     * A drawer titled "Add entry" over a page the merchant navigated to three
     * taps ago is a drawer they will fill in for whoever they were thinking of.
     */
    openDrawer('debit');
    renderWithProviders(<Harness />);

    expect(await screen.findByText('You gave · Ramesh Traders')).toBeInTheDocument();
  });

  it('does not open in a red state', async () => {
    /**
     * Prevents: the most frequent screen in the product opening with
     * "Enter an amount." already under the field, in error red, before the
     * merchant has touched anything.
     *
     * `mode: 'onTouched'` plus `autoFocus` on the amount is what did it: the
     * input takes focus on mount, the drawer's own focus trap then moves focus
     * to the dialog, and that BLUR marks the field touched and runs the
     * resolver against an empty value. Nothing was wrong with the form and
     * nothing failed; the screen simply told a merchant they had made a mistake
     * as it opened.
     *
     * A screenshot found it. Every assertion in this file was about what
     * happens after typing, and the accessible name of an empty required field
     * is correct either way.
     */
    openDrawer('debit');
    renderWithProviders(<Harness />);
    await screen.findByText('You gave · Ramesh Traders');

    expect(screen.queryByText('Enter an amount greater than 0')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'false');
  });

  it('asks how the money arrived only when money arrived', async () => {
    /**
     * §10's cross-field rule, and the asymmetry behind it. A credit MUST say
     * how — "I got ₹500" with no mode is a cashbook line nobody can reconcile.
     * A debit has nothing to say, so the control is not on the screen at all
     * rather than on it and ignored.
     */
    openDrawer('debit');
    renderWithProviders(<Harness />);
    await screen.findByText('You gave · Ramesh Traders');

    expect(screen.queryByLabelText('Received via')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'You got' }));

    expect(await screen.findByLabelText('Received via')).toBeInTheDocument();
  });

  it('keeps what was typed when the direction is switched', async () => {
    /**
     * FR-4 / EC-9. A merchant taps "You gave", types the amount, and realises
     * it was the other way round. Without this the switch costs a close, a
     * reopen and retyping — at the counter, with somebody waiting.
     */
    const user = userEvent.setup();
    openDrawer('debit');
    renderWithProviders(<Harness />);

    const amount = await screen.findByLabelText('Amount');
    await user.type(amount, '500');
    await user.click(screen.getByRole('radio', { name: 'You got' }));

    // Padded, because `UbMoneyInput` groups and pads on blur and the switch
    // blurs the field. What matters is that the figure survived at all.
    expect(screen.getByLabelText('Amount')).toHaveValue('500.00');
  });

  it('sends what the merchant typed, and not the fields a debit has no use for', async () => {
    /**
     * Asserted on the REQUEST, for the reason `e2e/parties.mjs` exists: a form
     * that validates is not a form that sends. The party form's tag chips
     * rendered, validated and saved with a 201 for a week while `toWireBody`
     * dropped every one of them.
     */
    const user = userEvent.setup();
    openDrawer('debit');
    renderWithProviders(<Harness />);

    await user.type(await screen.findByLabelText('Amount'), '500');
    await user.type(screen.getByLabelText(/^Note/), 'Sugar 10 kg');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(ledgerService.postLedgerEntry).toHaveBeenCalled());
    const [partyId, values] = ledgerService.postLedgerEntry.mock.calls[0];
    expect(partyId).toBe(PARTY_ID);
    expect(values).toMatchObject({
      direction: 'debit',
      // `UbMoneyInput` pads on blur, and the padded string is what canon rule 3
      // wants on the wire: "500.00", never `500`.
      amount: '500.00',
      note: 'Sugar 10 kg',
    });
  });

  it('remembers the payment mode this device used last', async () => {
    /**
     * FR-2. For almost every shop it is the same mode every time, and this is
     * the difference between two taps and one on the screen they use most.
     *
     * `localStorage` rather than the store: it is one person on one phone, it
     * must survive a reload, and it must never travel to another device.
     */
    window.localStorage.setItem('ub.lastPaymentMode', 'upi');
    openDrawer('credit');
    renderWithProviders(<Harness />);

    /* `UbSelect` is a Radix combobox rather than a native `<select>`, so the
       chosen value is the trigger's TEXT. Asserting `toHaveValue` here passed
       vacuously against an element that has no value at all. */
    expect(await screen.findByLabelText('Received via')).toHaveTextContent('UPI');
  });

  it('survives a phone that will not let it read a preference', async () => {
    /**
     * A private window, or cleared site data. The read throws, and a counter
     * screen that fails to OPEN because a convenience could not be read would
     * be a very poor trade for saving one tap.
     */
    const getItem = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });

    openDrawer('credit');
    renderWithProviders(<Harness />);

    expect(await screen.findByText('You got · Ramesh Traders')).toBeInTheDocument();
    getItem.mockRestore();
  });

  it('will not save an amount of nothing', async () => {
    const user = userEvent.setup();
    openDrawer('debit');
    renderWithProviders(<Harness />);

    await screen.findByLabelText('Amount');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(ledgerService.postLedgerEntry).not.toHaveBeenCalled());
  });

  it('keeps the entry on screen when the network drops it', async () => {
    /**
     * AC-6, and the reason the draft lives in the slice rather than in the
     * form. A merchant at a counter on a 2G connection must not lose the
     * amount because the request did not arrive — they are not going to
     * remember it, and the customer has already left.
     */
    ledgerService.postLedgerEntry.mockRejectedValue(apiError('network_error'));
    const user = userEvent.setup();
    openDrawer('debit');
    renderWithProviders(<Harness />);

    await user.type(await screen.findByLabelText('Amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(ledgerService.postLedgerEntry).toHaveBeenCalled());
    // Still open, still holding the amount.
    expect(screen.getByText('You gave · Ramesh Traders')).toBeInTheDocument();
    // Padded, because `UbMoneyInput` groups and pads on blur and the switch
    // blurs the field. What matters is that the figure survived at all.
    expect(screen.getByLabelText('Amount')).toHaveValue('500.00');
  });

  it('retries with the SAME idempotency key', async () => {
    /**
     * AC-6's other half, and the most damaging bug this feature could have. A
     * first request that actually reached the server and whose response was
     * lost must not become a second entry on a retry — that is two lines
     * against one customer and a balance wrong by the amount of the sale, which
     * is the number the merchant reads out at the counter.
     */
    ledgerService.postLedgerEntry.mockRejectedValueOnce(apiError('network_error'));
    const user = userEvent.setup();
    openDrawer('debit');
    renderWithProviders(<Harness />);

    await user.type(await screen.findByLabelText('Amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(ledgerService.postLedgerEntry).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(ledgerService.postLedgerEntry).toHaveBeenCalledTimes(2));

    const firstKey = ledgerService.postLedgerEntry.mock.calls[0][2];
    const secondKey = ledgerService.postLedgerEntry.mock.calls[1][2];
    expect(secondKey).toBe(firstKey);
  });

  it('takes a NEW key once the entry is safely written', async () => {
    /**
     * The mirror of the rule above, and it fails the other way: reusing a key
     * the server has already answered replays the entry just written rather
     * than recording the next sale, so the second customer's udhaar silently
     * does not happen.
     */
    const user = userEvent.setup();
    openDrawer('debit');
    const view = renderWithProviders(<Harness />);

    await user.type(await screen.findByLabelText('Amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(ledgerService.postLedgerEntry).toHaveBeenCalledTimes(1));

    openDrawer('debit');
    view.rerender(<Harness />);
    await user.type(await screen.findByLabelText('Amount'), '300');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(ledgerService.postLedgerEntry).toHaveBeenCalledTimes(2));

    expect(ledgerService.postLedgerEntry.mock.calls[1][2]).not.toBe(
      ledgerService.postLedgerEntry.mock.calls[0][2]
    );
  });

  it('tells the merchant the new balance in grouped rupees', async () => {
    /**
     * Prevents: "Saved ₹500.00 · balance is now ₹2800.00".
     *
     * The copy carries the ₹ because Hindi puts it elsewhere in the line, so
     * the amount has to arrive through `formatAmount` — which also groups it
     * the Indian way. Passed raw, a decimal string from the API reads as
     * `2800.00`, and the number a merchant says out loud at the counter is the
     * one thing in this feature that must be legible at a glance.
     *
     * This is the THIRD time this exact pair of mistakes has met in this
     * codebase: `creditCaption` had it, the credit-limit form hint had it, and
     * now the snackbar.
     */
    const user = userEvent.setup();
    openDrawer('debit');
    renderWithProviders(<Harness />);

    await user.type(await screen.findByLabelText('Amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    /* Asserted on the STORE rather than on the screen: the snackbar is mounted
       once in `AppProviders` and `renderWithProviders` does not carry it, so a
       `findByText` here would pass vacuously against a DOM that never had the
       message in it. What the hook decides is the params, and the params are
       what the host interpolates. */
    await waitFor(() => expect(store.getState().snackbar.id).toBe('ledger.entry.saved'));
    expect(store.getState().snackbar.params).toEqual({
      amount: '500.00',
      balance: '2,800.00',
    });
  });

  it('groups the figures in the over-limit notice too', async () => {
    ledgerService.postLedgerEntry.mockResolvedValue({
      entry: ENTRY,
      balance: '60000.00',
      warnings: [
        {
          code: 'credit_limit_exceeded',
          limit: '50000.00',
          balanceAfter: '60000.00',
          overBy: '10000.00',
        },
      ],
    });
    const user = userEvent.setup();
    openDrawer('debit');
    renderWithProviders(<Harness />);

    await user.type(await screen.findByLabelText('Amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(store.getState().snackbar.id).toBe('ledger.entry.savedOverLimit')
    );
    expect(store.getState().snackbar.params).toEqual({
      over: '10,000.00',
      limit: '50,000.00',
    });
  });

  it('anchors a server field error on the control the merchant can fix', async () => {
    ledgerService.postLedgerEntry.mockRejectedValue(
      apiError('validation_error', { entry_date: ['The date cannot be in the future.'] })
    );
    const user = userEvent.setup();
    openDrawer('debit');
    renderWithProviders(<Harness />);

    await user.type(await screen.findByLabelText('Amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('The date cannot be in the future.')).toBeInTheDocument();
  });
});

describe('the credit limit', () => {
  const blocked = () =>
    apiError('credit_limit_exceeded', {
      limit: '50000.00',
      balance_after: '50300.00',
      over_by: '300.00',
    });

  it('states the figures in place rather than toasting over a closing drawer', async () => {
    /**
     * Alternate D. The refusal is answerable right here — by an owner, at
     * least — so a toast that appears as the drawer closes answers nothing and
     * costs the merchant everything they typed.
     */
    ledgerService.postLedgerEntry.mockRejectedValue(blocked());
    const user = userEvent.setup();
    openDrawer('debit');
    renderWithProviders(<Harness />);

    await user.type(await screen.findByLabelText('Amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('This goes past their credit limit')).toBeInTheDocument();
    expect(screen.getByText(/Limit ₹50,000.00/)).toBeInTheDocument();
    // Grouped, and ONE rupee symbol: the copy carries the ₹ because Hindi puts
    // it elsewhere in the line, so the amount must arrive through `formatAmount`.
    expect(screen.queryByText(/₹₹/)).not.toBeInTheDocument();
  });

  it('offers an owner the override, and resends the same values with it', async () => {
    ledgerService.postLedgerEntry.mockRejectedValueOnce(blocked());
    const user = userEvent.setup();
    openDrawer('debit');
    renderWithProviders(<Harness />);

    await user.type(await screen.findByLabelText('Amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('button', { name: 'Save anyway' }));

    await waitFor(() => expect(ledgerService.postLedgerEntry).toHaveBeenCalledTimes(2));
    expect(ledgerService.postLedgerEntry.mock.calls[1][3]).toEqual({ override: true });
    expect(ledgerService.postLedgerEntry.mock.calls[1][1]).toMatchObject({ amount: '500.00' });
  });

  it('shows staff what to do instead of a button they cannot use', async () => {
    /**
     * BR-8 — a check on the ROLE, not on a codename. A tenant that grants a
     * staff member `ledger.entry.write`, which is the ordinary thing to do
     * because staff work the counter, must not thereby hand them the power to
     * lend past the cap the owner set. Drawing the button and letting the
     * server refuse it is a support call.
     */
    signIn('staff', ['ledger.entry.read', 'ledger.entry.write']);
    ledgerService.postLedgerEntry.mockRejectedValue(blocked());
    const user = userEvent.setup();
    openDrawer('debit');
    renderWithProviders(<Harness />);

    await user.type(await screen.findByLabelText('Amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('This goes past their credit limit');
    expect(screen.queryByRole('button', { name: 'Save anyway' })).not.toBeInTheDocument();
    expect(screen.getByText(/Ask the owner to record this one/)).toBeInTheDocument();
  });
});
