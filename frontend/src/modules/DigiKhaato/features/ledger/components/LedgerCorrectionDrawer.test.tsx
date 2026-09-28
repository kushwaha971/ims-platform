import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { useEntryCorrection } from '../hooks/useEntryCorrection';
import { resetLedgerEntries } from '../redux/ledgerEntrySlice';
import { correctionOpened, resetLedgerForm, reverseOpened } from '../redux/ledgerFormSlice';

import { LedgerCorrectionDrawer } from './LedgerCorrectionDrawer';
import { ReverseEntryDialog } from './ReverseEntryDialog';

import type { LedgerEntry } from '../types/ledger.types';

/**
 * LED-03's two write surfaces.
 *
 * What these assert is the merchant's side of the feature: that the form opens
 * on what is already there, that the reason cannot be skipped, that a refusal
 * lands where the merchant is standing rather than in a toast over a closing
 * dialog, and that an opening balance is offered the right question.
 *
 * What they deliberately do NOT assert is the request body — that is
 * `ledgerService.test.ts`, on the wire, for the reason `e2e/parties.mjs` exists:
 * the party form's tag chips rendered, validated and saved with a 201 for a
 * week while the service silently dropped every one of them.
 */
jest.mock('../api/ledgerService');

const ledgerService = jest.requireMock('../api/ledgerService') as {
  listPartyEntries: jest.Mock;
  correctLedgerEntry: jest.Mock;
  reverseLedgerEntry: jest.Mock;
};

const PARTY_ID = '11111111-1111-4111-8111-111111111111';

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'entry-1',
  partyId: PARTY_ID,
  direction: 'debit',
  amount: '500.00',
  entryDate: '2026-09-17',
  entryType: 'manual_gave',
  sourceType: 'manual',
  sourceId: null,
  note: 'Cement bags',
  paymentMode: null,
  upiApp: null,
  reference: '',
  status: 'posted',
  reversedById: null,
  reversesId: null,
  supersedesId: null,
  reason: null,
  createdBy: null,
  createdAt: '2026-09-17T10:00:00Z',
  ...over,
});

const apiError = (code: string, message: string, status = 409) => ({
  code,
  message,
  details: {},
  requestId: 'req_abc',
  status,
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

function Harness(): React.JSX.Element {
  const correction = useEntryCorrection();
  return (
    <>
      <ReverseEntryDialog correction={correction} />
      <LedgerCorrectionDrawer correction={correction} />
    </>
  );
}

beforeEach(() => {
  /* Both slices reset, and the second one is not belt-and-braces: an open
     dialog left behind by an earlier test makes the NEXT test's `getByRole`
     find two, and the failure names the later test rather than the one that
     leaked. `PartyDetailPageContent.test.tsx` lost an hour to exactly that. */
  store.dispatch(resetLedgerEntries());
  store.dispatch(resetLedgerForm());
  jest.clearAllMocks();
  ledgerService.correctLedgerEntry.mockResolvedValue({
    entry: entry({ id: 'replacement', amount: '550.00', supersedesId: 'entry-1' }),
    balance: '2850.00',
    originalId: 'entry-1',
    reversalId: 'reversal-1',
  });
  ledgerService.reverseLedgerEntry.mockResolvedValue({
    entry: entry({ id: 'reversal-1', direction: 'credit', entryType: 'reversal' }),
    balance: '2300.00',
    originalId: 'entry-1',
    reversalId: 'reversal-1',
  });
  signIn(['ledger.entry.read', 'ledger.entry.write', 'ledger.entry.correct']);
});

describe('the correction drawer', () => {
  it('opens on the values the entry already has', async () => {
    /* A correction is an edit in the merchant's head, whatever it is in the
       database: they typed 500 and meant 550, and the screen that helps them
       shows 500 with the cursor in it. An empty form would make them retype an
       amount, a date and a note to change one digit — and every field they
       retyped would be a field they could newly get wrong. */
    store.dispatch(correctionOpened(entry()));
    renderWithProviders(<Harness />);

    expect(await screen.findByLabelText('Amount')).toHaveValue('500.00');
    expect(screen.getByLabelText(/Note/)).toHaveValue('Cement bags');
  });

  it('will not save without a reason', async () => {
    store.dispatch(correctionOpened(entry()));
    renderWithProviders(<Harness />);

    await userEvent.clear(await screen.findByLabelText('Amount'));
    await userEvent.type(screen.getByLabelText('Amount'), '550.00');
    await userEvent.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(await screen.findByText(/Give a short reason/)).toBeInTheDocument();
    expect(ledgerService.correctLedgerEntry).not.toHaveBeenCalled();
  });

  it('saves and reports the balance the correction produced', async () => {
    store.dispatch(correctionOpened(entry()));
    renderWithProviders(<Harness />);

    await userEvent.clear(await screen.findByLabelText('Amount'));
    await userEvent.type(screen.getByLabelText('Amount'), '550.00');
    await userEvent.type(screen.getByLabelText('Reason'), 'Typed 500 instead of 550');
    await userEvent.click(screen.getByRole('button', { name: 'Save correction' }));

    await waitFor(() => expect(ledgerService.correctLedgerEntry).toHaveBeenCalled());
    /* Asserted on the STORE rather than on the screen, because
       `renderWithProviders` does not mount the snackbar — and the figures are
       the point: every one goes through `formatAmount` and not `formatInr`,
       because the copy carries its own ₹. That pair has now met four times in
       this codebase. */
    await waitFor(() => expect(store.getState().snackbar.id).toBe('ledger.correction.corrected'));
    expect(store.getState().snackbar.params).toEqual({
      amount: '550.00',
      balance: '2,850.00',
    });
  });

  it('asks an opening balance the question an opening balance is asked', async () => {
    /* "You gave" is the wrong tense and the wrong claim on a row where nothing
       changed hands: it is the position the book started from. LED-02's form
       asks "They owe me" / "I owe them", and a correction that relabelled the
       same control would be asking a different question about the same row. */
    store.dispatch(correctionOpened(entry({ entryType: 'opening', note: 'Opening balance' })));
    renderWithProviders(<Harness />);

    expect(await screen.findByRole('radio', { name: 'They owe me' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'You gave' })).not.toBeInTheDocument();
    // No note field: the server owns that string, in English, so a merchant who
    // typed one and watched it vanish would have learned the app loses work.
    expect(screen.queryByLabelText(/Note/)).not.toBeInTheDocument();
  });

  it('puts a document-backed refusal in front of the merchant, not in a toast', async () => {
    /* FR-6. The answer is "go and void the invoice", which is a different
       screen — saying so where they are standing is the only version of that
       message that helps. */
    ledgerService.correctLedgerEntry.mockRejectedValue(
      apiError(
        'use_document_void',
        'This entry came from a document. Void that document to reverse it.'
      )
    );
    store.dispatch(correctionOpened(entry()));
    renderWithProviders(<Harness />);

    await userEvent.clear(await screen.findByLabelText('Amount'));
    await userEvent.type(screen.getByLabelText('Amount'), '550.00');
    await userEvent.type(screen.getByLabelText('Reason'), 'Wrong figure');
    await userEvent.click(screen.getByRole('button', { name: 'Save correction' }));

    expect(await screen.findByText(/Void that document/)).toBeInTheDocument();
    // Still open, with what was typed — nothing to retype.
    expect(screen.getByLabelText('Amount')).toHaveValue('550.00');
  });
});

describe('the reverse dialog', () => {
  it('names the entry it is about to undo', async () => {
    /* §23's confirmation rule, and it earns its space: the ⋯ menu covered the
       row, and on a phone the list has very likely scrolled. Confirming
       "reverse ₹500 — cement bags" is confirming something; confirming
       "reverse this entry" is confirming that you pressed a button. */
    store.dispatch(reverseOpened(entry()));
    renderWithProviders(<Harness />);

    expect(await screen.findByText('Cement bags')).toBeInTheDocument();
    /* `UbAmount` splits the figure across a sign slot, the grouped number and
       an `sr-only` string, so no single text node is "500.00". The dialog as a
       whole is what the merchant reads, and asserting on it is also what keeps
       this test honest if the amount ever moves within the panel. */
    expect(screen.getByRole('dialog')).toHaveTextContent('500.00');
  });

  it('will not reverse without a reason', async () => {
    store.dispatch(reverseOpened(entry()));
    renderWithProviders(<Harness />);

    await userEvent.click(await screen.findByRole('button', { name: 'Reverse entry' }));

    expect(await screen.findByText(/Give a short reason/)).toBeInTheDocument();
    expect(ledgerService.reverseLedgerEntry).not.toHaveBeenCalled();
  });

  it('reverses and says what the balance is now', async () => {
    store.dispatch(reverseOpened(entry()));
    renderWithProviders(<Harness />);

    await userEvent.type(await screen.findByLabelText('Reason'), 'Duplicate entry');
    await userEvent.click(screen.getByRole('button', { name: 'Reverse entry' }));

    await waitFor(() => expect(ledgerService.reverseLedgerEntry).toHaveBeenCalled());
    await waitFor(() => expect(store.getState().snackbar.id).toBe('ledger.correction.reversed'));
  });

  it('says so in place when somebody else got there first', async () => {
    /* EC-2 across two devices. The row on screen is stale and the merchant's
       next action is to close and look again — which is a sentence, not a toast
       that vanishes while they are still reading the line it is about. */
    ledgerService.reverseLedgerEntry.mockRejectedValue(
      apiError('entry_already_reversed', 'This entry has already been reversed.')
    );
    store.dispatch(reverseOpened(entry()));
    renderWithProviders(<Harness />);

    await userEvent.type(await screen.findByLabelText('Reason'), 'Duplicate entry');
    await userEvent.click(screen.getByRole('button', { name: 'Reverse entry' }));

    expect(await screen.findByText(/already been reversed/)).toBeInTheDocument();
  });

  it('is not offered at all without the permission', () => {
    /* BR-8. Staff record what happens at the counter; going back and changing a
       number a customer has already been shown is the owner's decision. The
       hook answers false and the timeline never draws the ⋯. */
    signIn(['ledger.entry.read', 'ledger.entry.write']);
    /* The answer is RENDERED rather than assigned to a closure variable. The
       React Compiler's lint refuses the closure — writing to a variable declared
       outside the component during render is a side effect — and it is right to:
       a probe that only works because this component happens to render once is a
       probe that lies the day it renders twice. */
    function Probe(): React.JSX.Element {
      return <output>{String(useEntryCorrection().canCorrect)}</output>;
    }
    renderWithProviders(<Probe />);

    expect(screen.getByRole('status')).toHaveTextContent('false');
  });
});
