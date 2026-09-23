import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { partyEditOpened, resetPartyForm } from '../redux/partyFormSlice';
import { resetPartyList } from '../redux/partyListSlice';
import { resetPartyTags } from '../redux/partyTagSlice';

import { PartyListPageContent } from './PartyListPageContent';

/**
 * PTY-01 through the real screen: the button that opens it, the form, the
 * server's refusals, and the two rules a merchant would notice first.
 */
jest.mock('../api/partyService');
/* PTY-05 — the form's Tags picker asks for the tenant's tags on mount. Stubbed
   at the same module boundary as `partyService`, so these tests decide what the
   picker offers rather than leaving an unmocked request to fail into jsdom. */
jest.mock('../api/tagService');

/* The list underneath the drawer navigates now, so this file's renders need a
   router too — the drawer is opened from `PartyListPageContent`. */
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/parties',
}));

const tagService = jest.requireMock('../api/tagService') as { listTags: jest.Mock };

const partyService = jest.requireMock('../api/partyService') as {
  listParties: jest.Mock;
  createParty: jest.Mock;
  updateParty: jest.Mock;
};

const EMPTY = {
  rows: [],
  meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
  totals: null,
  totalsScope: 'page' as const,
};

const SAVED = {
  party: {
    id: 'p-1',
    name: 'Ramesh Traders',
    displayCode: null,
    mobile: '+919812345678',
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
    smsOptIn: true,
    consentSource: null,
    billingAddress: {},
    openingAmount: null,
    openingDirection: null,
    openingAsOf: null,
    createdAt: '2026-01-05T08:00:00Z',
  },
  warnings: [],
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
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: [],
      version: 1,
    })
  );
};

beforeEach(() => {
  store.dispatch(resetPartyList());
  store.dispatch(resetPartyForm());
  store.dispatch(resetPartyTags());
  jest.clearAllMocks();
  tagService.listTags.mockResolvedValue([]);
  partyService.listParties.mockResolvedValue(EMPTY);
  partyService.createParty.mockResolvedValue(SAVED);
  partyService.updateParty.mockResolvedValue(SAVED);
  signIn(['parties.party.read', 'parties.party.write']);
});

const openForm = async (user: ReturnType<typeof userEvent.setup>) => {
  renderWithProviders(<PartyListPageContent />);
  await screen.findByTestId('ub-grid');
  // Two of them: the header action and the empty state's own call to action.
  const [addButton] = screen.getAllByRole('button', { name: 'Add party' });
  if (!addButton) throw new Error('the list offered no way to add a party');
  await user.click(addButton);
  return screen.findByRole('dialog', { name: 'Add party' });
};

describe('adding a party', () => {
  it('asks for a name and a number and nothing else', async () => {
    const user = userEvent.setup();
    const drawer = await openForm(user);

    // The fifteen-second path. Everything else is behind a disclosure that
    // starts closed, including the GST section that looks important and is in
    // the way of the person adding their fourth customer of the morning.
    expect(within(drawer).getByLabelText('Name')).toBeInTheDocument();
    expect(within(drawer).getByLabelText('Mobile number')).toBeInTheDocument();
    expect(within(drawer).queryByLabelText('GSTIN')).not.toBeInTheDocument();
    expect(within(drawer).queryByLabelText('Credit limit')).not.toBeInTheDocument();
  });

  it('sends what was typed and closes', async () => {
    const user = userEvent.setup();
    const drawer = await openForm(user);

    await user.type(within(drawer).getByLabelText('Name'), 'Ramesh Traders');
    await user.type(within(drawer).getByLabelText('Mobile number'), '9812345678');
    await user.click(within(drawer).getByRole('button', { name: 'Save party' }));

    await waitFor(() => expect(partyService.createParty).toHaveBeenCalledTimes(1));
    const [values, key] = partyService.createParty.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(values.name).toBe('Ramesh Traders');
    // The key is minted once per logical save. A party with no mobile has no
    // uniqueness backstop, so it is the only protection against a double tap.
    expect(key).toBeTruthy();

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add party' })).not.toBeInTheDocument()
    );
  });

  it('refuses a party that is neither a customer nor a supplier', async () => {
    const user = userEvent.setup();
    const drawer = await openForm(user);

    await user.type(within(drawer).getByLabelText('Name'), 'Nobody');
    await user.click(within(drawer).getByRole('switch', { name: 'I sell to them' }));
    await user.click(within(drawer).getByRole('button', { name: 'Save party' }));

    // FR-4 — a party this business neither buys from nor sells to is a contact,
    // and this product does not have contacts. Caught here rather than by a
    // round trip, because the answer is the same and this one points at the
    // control.
    expect(await screen.findByText(/customer, a supplier, or both/)).toBeInTheDocument();
    expect(partyService.createParty).not.toHaveBeenCalled();
  });
});

describe('what the server says back', () => {
  it('opens the section a rejected field is hidden in', async () => {
    const user = userEvent.setup();
    partyService.createParty.mockRejectedValue({
      code: 'validation_error',
      message: 'Please check the highlighted fields.',
      details: { gstin: ['Check the GSTIN.'] },
      requestId: 'req_1',
    });

    const drawer = await openForm(user);
    await user.type(within(drawer).getByLabelText('Name'), 'Ramesh Traders');
    await user.click(within(drawer).getByRole('button', { name: 'Save party' }));

    // An error in a folded-away section is an error nobody can fix. The GST
    // group opens itself and the message is on the field.
    expect(await screen.findByLabelText('GSTIN')).toBeInTheDocument();
    expect(screen.getByText('Check the GSTIN.')).toBeInTheDocument();
  });

  it('offers to open the party holding a duplicate number, without naming it', async () => {
    const user = userEvent.setup();
    partyService.createParty.mockRejectedValue({
      code: 'validation_error',
      message: 'Please check the highlighted fields.',
      details: {
        mobile: ['This mobile number is already used by another party.'],
        existing_party_id: 'p-existing',
        existing_status: 'active',
      },
      requestId: 'req_2',
    });

    const drawer = await openForm(user);
    await user.type(within(drawer).getByLabelText('Name'), 'Second Try');
    await user.type(within(drawer).getByLabelText('Mobile number'), '9812345678');
    await user.click(within(drawer).getByRole('button', { name: 'Save party' }));

    // The server deliberately does not send the other party's NAME — that is
    // another record's data, returned to somebody who asked about neither. So
    // the form offers the door rather than the answer.
    const link = await screen.findByRole('link', { name: 'Open it' });
    expect(link).toHaveAttribute('href', '/parties/p-existing');
  });

  it('keeps an archived party refusal at form level, not on a field', async () => {
    const user = userEvent.setup();
    partyService.createParty.mockRejectedValue({
      code: 'party_archived',
      message: 'Restore this party before editing it.',
      details: {},
      requestId: 'req_3',
    });

    const drawer = await openForm(user);
    await user.type(within(drawer).getByLabelText('Name'), 'Ramesh Traders');
    await user.click(within(drawer).getByRole('button', { name: 'Save party' }));

    // The request was well formed; the record's state said no. There is no
    // field to point at, and the merchant's next move is Restore.
    expect(await screen.findByText('Restore this party before editing it.')).toBeInTheDocument();
  });
});

describe('an accountant', () => {
  it('is not offered the button at all', async () => {
    signIn(['parties.party.read']);
    renderWithProviders(<PartyListPageContent />);
    await screen.findByTestId('ub-grid');

    // Hidden, not disabled (§19.7.5). A disabled button invites a support call
    // about a permission that is never going to change.
    expect(screen.queryByRole('button', { name: 'Add party' })).not.toBeInTheDocument();
  });
});

describe('what the merchant is told afterwards', () => {
  it('never prints the internal id it was given to link with', async () => {
    const user = userEvent.setup();
    partyService.createParty.mockRejectedValue({
      code: 'validation_error',
      message: 'Please check the highlighted fields.',
      details: {
        mobile: ['This mobile number is already used by another party.'],
        existing_party_id: '01a0c885-da81-700d-a83b-0ffcd409092b',
        existing_status: 'active',
      },
      requestId: 'req_4',
    });

    const drawer = await openForm(user);
    await user.type(within(drawer).getByLabelText('Name'), 'Second Try');
    await user.type(within(drawer).getByLabelText('Mobile number'), '9812345678');
    await user.click(within(drawer).getByRole('button', { name: 'Save party' }));

    // `details` carries messages AND data. `applyServerErrors` anchors
    // anything it cannot match to a field as a form-level error, so the id and
    // the word "active" were printed in red above the name — meaningless to a
    // merchant and an internal id on screen for no reason.
    await screen.findByRole('link', { name: 'Open it' });
    expect(screen.queryByText(/01a0c885/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^active$/)).not.toBeInTheDocument();
  });

  it('says the GSTIN state disagreed, because nothing else will', async () => {
    const user = userEvent.setup();
    partyService.createParty.mockResolvedValue({
      ...SAVED,
      warnings: [
        {
          code: 'gstin_state_mismatch',
          field: 'gstin',
          gstinStateCode: '27',
          stateCode: '29',
        },
      ],
    });

    const drawer = await openForm(user);
    await user.type(within(drawer).getByLabelText('Name'), 'Ramesh Traders');
    await user.click(within(drawer).getByRole('button', { name: 'Save party' }));

    // The record SAVED, and the drawer has closed — so the note has to live
    // outside the form. Asserted on the store rather than on the DOM because
    // the snackbar is mounted once in `AppProviders`, not by this page: what
    // this component is responsible for is DISPATCHING the message, and that
    // is exactly what is checked.
    await waitFor(() => expect(store.getState().snackbar.snackbarOpen).toBe(true));
    const snackbar = store.getState().snackbar;
    expect(snackbar.snackbarSeverity).toBe('warning');
    expect(snackbar.id).toBe('parties.form.warning.gstinState');
    expect(snackbar.params).toMatchObject({ gstinState: '27', state: '29' });
  });

  // ── PTY-02 T-PTY-02-15 — the way out of a search that found nobody ────────

  it('opens the form with the searched name already filled in', async () => {
    /**
     * A search that found nobody usually means the party is not in the book
     * yet, not that the merchant mistyped. They have typed the name once
     * already; the empty state's job is to turn that into a party rather than
     * into a second round of typing on a 360px keyboard.
     */
    const user = userEvent.setup();
    renderWithProviders(<PartyListPageContent />);
    await screen.findByTestId('ub-grid');

    await user.type(screen.getByLabelText('Search customers'), 'Kamla Devi');

    const add = await screen.findByRole('button', { name: 'Add “Kamla Devi”' });
    await user.click(add);

    const name = await screen.findByLabelText(/Name/);
    expect(name).toHaveValue('Kamla Devi');
  });

  it('does not offer to add anyone when the search box is empty', async () => {
    /**
     * A chip that matched nothing says nothing about what to call a new party,
     * and an Add button with an empty pair of quotation marks in its label
     * opens a form with an empty required field and no explanation.
     *
     * This assertion is only worth anything with a writer signed in, which is
     * why it lives here: in a store with no permissions the button is absent
     * regardless and the test proves nothing.
     */
    renderWithProviders(<PartyListPageContent />);
    await screen.findByTestId('ub-grid');

    expect(screen.queryByRole('button', { name: /“/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add party' }).length).toBeGreaterThan(0);
  });

  it('forgets the prefilled name the next time the form is opened blank', async () => {
    /**
     * `prefillName` is store state, so it outlives the drawer unless something
     * clears it — and a merchant who cancels a prefilled form and then presses
     * the header's Add button would otherwise get the old search term back in
     * a form they opened to type something else.
     */
    const user = userEvent.setup();
    renderWithProviders(<PartyListPageContent />);
    await screen.findByTestId('ub-grid');

    await user.type(screen.getByLabelText('Search customers'), 'Kamla Devi');
    await user.click(await screen.findByRole('button', { name: 'Add “Kamla Devi”' }));
    expect(await screen.findByLabelText(/Name/)).toHaveValue('Kamla Devi');

    // The drawer has both an X in its header and a Cancel in its footer.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const [header] = screen.getAllByRole('button', { name: 'Add party' });
    if (!header) throw new Error('the list offered no way to add a party');
    await user.click(header);

    expect(await screen.findByLabelText(/Name/)).toHaveValue('');
  });
});

describe('PTY-06 — the credit limit on the form', () => {
  /**
   * FR-13. Lowering a limit below what somebody already owes is ALLOWED, and it
   * is often the whole point: a merchant who has decided to stop lending to
   * this person is doing it precisely when they are owed the most. Refusing it
   * would trap them, and it reverses nothing already posted (BR-10).
   *
   * So the form says what will be true and lets them save. The assertion that
   * matters is the second one: the Save button is still live.
   */
  it('warns that a limit is already crossed, without refusing it', async () => {
    const user = userEvent.setup();
    store.dispatch(
      partyEditOpened({ ...SAVED.party, balance: '47500.00', creditLimit: '50000.00' })
    );

    renderWithProviders(<PartyListPageContent />);
    await screen.findByRole('button', { name: 'Save changes' });

    await user.click(screen.getByRole('button', { name: 'Credit' }));
    const limit = await screen.findByRole('textbox', { name: /Credit limit/i });
    await user.clear(limit);
    await user.type(limit, '10000');

    expect(
      await screen.findByText(
        'They already owe ₹47,500.00 — this limit is already crossed'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('says nothing when the new limit still covers what they owe', async () => {
    const user = userEvent.setup();
    store.dispatch(
      partyEditOpened({ ...SAVED.party, balance: '4750.00', creditLimit: '50000.00' })
    );

    renderWithProviders(<PartyListPageContent />);
    await screen.findByRole('button', { name: 'Save changes' });

    await user.click(screen.getByRole('button', { name: 'Credit' }));
    const limit = await screen.findByRole('textbox', { name: /Credit limit/i });
    await user.clear(limit);
    await user.type(limit, '10000');

    expect(screen.queryByText(/already crossed/)).not.toBeInTheDocument();
  });

  it('compares the figures as MONEY, not as strings', async () => {
    /**
     * "9" is not more than "47500", and a string comparison says it is. The
     * hint is the only arithmetic this component does, and it goes through
     * `compareMoney` — which parses both with decimal.js-light — for the same
     * reason every other figure in this product does (canon rule 3).
     */
    const user = userEvent.setup();
    store.dispatch(
      partyEditOpened({ ...SAVED.party, balance: '47500.00', creditLimit: '50000.00' })
    );

    renderWithProviders(<PartyListPageContent />);
    await screen.findByRole('button', { name: 'Save changes' });

    await user.click(screen.getByRole('button', { name: 'Credit' }));
    const limit = await screen.findByRole('textbox', { name: /Credit limit/i });
    await user.clear(limit);
    await user.type(limit, '9');

    expect(await screen.findByText(/already crossed/)).toBeInTheDocument();
  });
});