import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import { chooseOption } from 'src/tests/selectHelper';

import en from 'locales/en.json';
import hi from 'locales/hi.json';

import { fetchSession } from '../../auth/redux/sessionThunk';
import { resetOnboarding } from '../redux/onboardingSlice';
import { createTenant } from '../redux/onboardingThunk';

import { OnboardingStepPageContent } from './OnboardingStepPageContent';

/**
 * PLT-03, end to end inside the client (§19.13.3): route → content → hook →
 * thunk → service → axios, with the service stubbed at the module boundary.
 * It exercises the §9 states the wizard owns — Initial, Loading, Success (the
 * step advances), Error (field-level and the `gstin_in_use` 409), Partial (a
 * resume with earlier steps ticked), Processing and Failed.
 */
jest.mock('../api/onboardingService');
jest.mock('../../auth/api/authService');

const onboardingService = jest.requireMock('../api/onboardingService') as {
  createTenant: jest.Mock;
  fetchCurrentTenant: jest.Mock;
  updateBusinessStep: jest.Mock;
  updateGstStep: jest.Mock;
  updateAddressStep: jest.Mock;
  completeOnboarding: jest.Mock;
};
const authService = jest.requireMock('../../auth/api/authService') as { getSession: jest.Mock };

const push = jest.fn();
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/onboarding/step/1',
}));

const tenant = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Sharma General Store',
  businessType: 'retail',
  stateCode: '27',
  gstType: 'unregistered',
  gstin: null,
  legalName: null,
  pan: null,
  phone: null,
  email: null,
  locale: 'en',
  onboardingStep: 1,
  enabledModules: ['ledger', 'parties', 'inventory'],
  address: { line1: null, line2: null, city: null, district: null, pincode: null },
  ...over,
});

beforeEach(() => {
  store.dispatch(resetOnboarding());
  // NEW-1 — step 1's idempotency key now outlives a reload in localStorage,
  // which jsdom keeps across tests; each test starts with none persisted.
  window.localStorage.clear();
  jest.clearAllMocks();
  authService.getSession.mockResolvedValue({
    user: { id: 'u1', name: 'Ramesh', mobile: '+919876543210', locale: 'en' },
    activeTenant: null,
    tenants: [],
    permissions: [],
    enabledModules: [],
    version: null,
  });
});

describe('the wizard — step 1 (FR-2)', () => {
  it('renders the four-step progress and the nine business-type tiles', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);

    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    const grid = screen.getByRole('radiogroup', { name: 'What kind of business?' });
    expect(grid).toBeInTheDocument();
    // The nine types of FR-7's table, each with its one-line hint (§8).
    expect(screen.getAllByRole('radio')).toHaveLength(9);
    expect(screen.getByText('Walk-in customers, udhaar')).toBeInTheDocument();
  });

  it('creates the tenant and advances to step 2', async () => {
    const user = userEvent.setup();
    onboardingService.createTenant.mockResolvedValue({ tenant: tenant(), warnings: [] });

    renderWithProviders(<OnboardingStepPageContent step={1} />);
    await user.type(screen.getByLabelText(/Business name/), 'Sharma General Store');
    await user.click(screen.getByRole('radio', { name: /Retail shop/ }));
    await chooseOption(user, /^State/, /Maharashtra/);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onboardingService.createTenant).toHaveBeenCalledTimes(1));
    expect(onboardingService.createTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Sharma General Store',
        businessType: 'retail',
        stateCode: '27',
      }),
      // EC-7 — the caller's idempotency key, reused on every retry.
      expect.any(String)
    );
    expect(push).toHaveBeenCalledWith('/onboarding/step/2');
    expect(store.getState().onboarding.completedStep).toBe(1);
  });

  it('refuses a one-character business name before it reaches the wire', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingStepPageContent step={1} />);

    await user.type(screen.getByLabelText(/Business name/), 'S');
    await user.click(screen.getByRole('radio', { name: /Retail shop/ }));
    await chooseOption(user, /^State/, /Maharashtra/);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onboardingService.createTenant).not.toHaveBeenCalled());
  });

  it('has no Skip on step 1 — a wizard cannot patch a business that does not exist', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
  });
});

/**
 * PLT-03 FR-9 — "steps already completed are navigable via the stepper for
 * edits", and canon §0.11 rule 5.
 *
 * The regression: `submitBusinessStep` called `createTenant` with no branch on
 * "a tenant already exists". A merchant on step 2 who noticed the business name
 * was misspelled, tapped "1 · Business" in the stepper, fixed it and pressed
 * Continue ended up owning TWO businesses with almost the same name — the
 * second of them the active tenant — and there is no delete-business path at
 * MVP, so the duplicate is permanent.
 */
describe('the wizard — step 1 EDITED (FR-9)', () => {
  const withExistingTenant = async () => {
    onboardingService.createTenant.mockResolvedValue({
      tenant: tenant({ onboardingStep: 2 }),
      warnings: [],
    });
    await store.dispatch(
      createTenant({
        name: 'Sharma General Stor',
        businessType: 'retail',
        stateCode: '27',
        ownerName: null,
        idempotencyKey: 'k',
      })
    );
    jest.clearAllMocks();
  };

  it('PATCHes the existing business instead of creating a second one', async () => {
    const user = userEvent.setup();
    await withExistingTenant();
    onboardingService.updateBusinessStep.mockResolvedValue({
      tenant: tenant({ name: 'Sharma General Store', onboardingStep: 2 }),
      warnings: [],
    });

    renderWithProviders(<OnboardingStepPageContent step={1} />);

    const nameField = screen.getByLabelText(/Business name/);
    await user.clear(nameField);
    await user.type(nameField, 'Sharma General Store');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onboardingService.updateBusinessStep).toHaveBeenCalledTimes(1));
    // The whole point: no second business.
    expect(onboardingService.createTenant).not.toHaveBeenCalled();
    expect(onboardingService.updateBusinessStep).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Sharma General Store',
        businessType: 'retail',
        stateCode: '27',
      })
    );
    // One tenant, still the same one.
    expect(store.getState().onboarding.tenantId).toBe('t1');
  });

  it('returns the merchant to the step they interrupted, not back to step 2', async () => {
    const user = userEvent.setup();
    await withExistingTenant();
    onboardingService.updateBusinessStep.mockResolvedValue({
      tenant: tenant({ name: 'Sharma General Store', onboardingStep: 3 }),
      warnings: [],
    });

    renderWithProviders(<OnboardingStepPageContent step={1} />);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onboardingService.updateBusinessStep).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith('/onboarding/step/4');
  });

  /**
   * EC-7 — the key for `POST /tenants` is minted ONCE per wizard. Every step is
   * its own route, so `useOnboarding` remounts on every navigation; when the
   * key lived in `useIdempotencyKey`'s `useState` initialiser, each remount
   * minted a new one and a retry after a lost 201 was not deduplicated at all.
   */
  it('keeps one idempotency key across a remount, so a retry is deduplicated', async () => {
    const user = userEvent.setup();
    onboardingService.createTenant.mockRejectedValue(new Error('the 201 was lost'));

    const first = renderWithProviders(<OnboardingStepPageContent step={1} />);
    await user.type(screen.getByLabelText(/Business name/), 'Sharma General Store');
    await user.click(screen.getByRole('radio', { name: /Retail shop/ }));
    await chooseOption(user, /^State/, /Maharashtra/);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onboardingService.createTenant).toHaveBeenCalledTimes(1));
    const keyOnFirstAttempt = onboardingService.createTenant.mock.calls[0]?.[1] as string;
    first.unmount();

    // The merchant retries; the route remounted the hook in between.
    onboardingService.createTenant.mockResolvedValue({ tenant: tenant(), warnings: [] });
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    await user.type(screen.getByLabelText(/Business name/), 'Sharma General Store');
    await user.click(screen.getByRole('radio', { name: /Retail shop/ }));
    await chooseOption(user, /^State/, /Maharashtra/);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onboardingService.createTenant).toHaveBeenCalledTimes(2));

    expect(onboardingService.createTenant.mock.calls[1]?.[1]).toBe(keyOnFirstAttempt);
  });
});

describe('the wizard — step 2 (FR-3)', () => {
  const atStepTwo = async () => {
    onboardingService.createTenant.mockResolvedValue({ tenant: tenant(), warnings: [] });
    await store.dispatch(
      createTenant({
        name: 'Sharma',
        businessType: 'retail',
        stateCode: '27',
        ownerName: null,
        idempotencyKey: 'k',
      })
    );
  };

  it('hides the GSTIN fields until the business says it is registered', async () => {
    const user = userEvent.setup();
    await atStepTwo();
    renderWithProviders(<OnboardingStepPageContent step={2} />);

    // §8 — the default is "Not registered", which is true of most of them.
    expect(screen.queryByLabelText(/GSTIN/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Regular GST/ }));
    expect(screen.getByLabelText(/GSTIN/)).toBeInTheDocument();
  });

  it('fills the PAN from the GSTIN and warns about a state mismatch', async () => {
    const user = userEvent.setup();
    await atStepTwo();
    renderWithProviders(<OnboardingStepPageContent step={2} />);

    await user.click(screen.getByRole('radio', { name: /Regular GST/ }));
    // A Uttar Pradesh GSTIN against the Maharashtra chosen on step 1.
    await user.type(screen.getByLabelText(/GSTIN/), '09AAPFU0939F1ZP');

    await waitFor(() => expect(screen.getByLabelText(/^PAN/)).toHaveValue('AAPFU0939F'));
    // FR-3 — a warning with an offer, never a block.
    expect(await screen.findByText(/GSTIN belongs to Uttar Pradesh/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use state from GSTIN' })).toBeInTheDocument();
  });

  it('skips to step 3 as explicitly unregistered (FR-10)', async () => {
    const user = userEvent.setup();
    await atStepTwo();
    onboardingService.updateGstStep.mockResolvedValue({
      tenant: tenant({ onboardingStep: 2 }),
      warnings: [],
    });

    renderWithProviders(<OnboardingStepPageContent step={2} />);
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));

    await waitFor(() =>
      expect(onboardingService.updateGstStep).toHaveBeenCalledWith({
        gstType: 'unregistered',
        gstin: null,
        legalName: null,
        pan: null,
      })
    );
    expect(push).toHaveBeenCalledWith('/onboarding/step/3');
  });

  it("anchors a 409 gstin_in_use on the field, with the server's guidance", async () => {
    const user = userEvent.setup();
    await atStepTwo();
    onboardingService.updateGstStep.mockRejectedValue({
      code: 'gstin_in_use',
      message: 'This GSTIN is already registered.',
      details: {},
      requestId: 'req_3',
      status: 409,
      warnings: [],
    });

    renderWithProviders(<OnboardingStepPageContent step={2} />);
    await user.click(screen.getByRole('radio', { name: /Regular GST/ }));
    await user.type(screen.getByLabelText(/GSTIN/), '27AAPFU0939F1ZV');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // It appears twice on purpose: anchored on the field so the merchant can
    // fix it, and as the §9 banner so it survives scrolling past the field.
    const messages = await screen.findAllByText('This GSTIN is already registered.');
    expect(messages.some((node) => node.getAttribute('id') === 'gstin-error')).toBe(true);
  });
});

describe('the wizard — step 4 (FR-5) and §9 Failed', () => {
  const atSummary = async () => {
    onboardingService.createTenant.mockResolvedValue({
      tenant: tenant({ onboardingStep: 3 }),
      warnings: [],
    });
    await store.dispatch(
      createTenant({
        name: 'Sharma',
        businessType: 'retail',
        stateCode: '27',
        ownerName: null,
        idempotencyKey: 'k',
      })
    );
  };

  it('summarises the preset and promises the ledger is never limited', async () => {
    await atSummary();
    renderWithProviders(<OnboardingStepPageContent step={4} />);

    expect(screen.getByText('What we will set up')).toBeInTheDocument();
    expect(screen.getByText('Retail shop')).toBeInTheDocument();
    // D-L5 — no defaults for unbuilt screens: bills (due days), items (units)
    // and expenses (categories) are all "Soon" in the sidebar.
    expect(screen.queryByText('Bill due in')).not.toBeInTheDocument();
    expect(screen.queryByText('7 days')).not.toBeInTheDocument();
    expect(screen.queryByText('Favourite units')).not.toBeInTheDocument();
    expect(screen.queryByText('NOS, KGS, GMS, LTR, PAC')).not.toBeInTheDocument();
    expect(screen.queryByText('Extra expense categories')).not.toBeInTheDocument();
    // FR-8 / canon §0.2 — defaults, never hard-wired behaviour. No longer
    // "change all of this in Settings": Settings is not built (UAT D8).
    expect(screen.getByText('These are starting defaults, not rules.')).toBeInTheDocument();
    expect(screen.queryByText(/Settings/)).not.toBeInTheDocument();
  });

  it('shows only what is built — no Stock row, no unbuilt modules (UAT D8)', async () => {
    /* Prevents UAT D8: the card read "Stock: On" and "What you get: Stock,
       Bills & estimates, Purchases, Payments, Expenses" on a product where
       each of those is a "Soon" row. What a merchant can open today is listed;
       the rest is not mentioned (owner rule: unbuilt features are not shown). */
    await atSummary();
    renderWithProviders(<OnboardingStepPageContent step={4} />);

    expect(screen.getByText('Ready to use')).toBeInTheDocument();
    expect(screen.getByText('Customers & suppliers')).toBeInTheDocument();
    expect(screen.getByText('Udhaar khata')).toBeInTheDocument();
    expect(screen.queryByText('What you get')).not.toBeInTheDocument();
    expect(screen.queryByText('Stock')).not.toBeInTheDocument();
    expect(screen.queryByText('Bills & estimates')).not.toBeInTheDocument();
    expect(screen.queryByText('On')).not.toBeInTheDocument();
  });

  it('applies the preset and lands on the customer list (there is no dashboard)', async () => {
    const user = userEvent.setup();
    await atSummary();
    onboardingService.completeOnboarding.mockResolvedValue({
      tenant: tenant({ onboardingStep: 4 }),
      warnings: [],
    });

    renderWithProviders(<OnboardingStepPageContent step={4} />);
    await user.click(screen.getByRole('button', { name: /Start using/ }));

    await waitFor(() => expect(onboardingService.completeOnboarding).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/parties'));
  });

  /**
   * CR-2026-09-19-E — was "stays on step 4 with Retry and the request id". The
   * in-page error banner (and the Retry inside it) is gone: a failed preset is
   * an API failure and surfaces once, centrally, through the snackbar, which
   * carries the request id exactly as that banner did (see
   * src/tests/globalErrorChannel.test.tsx).
   *
   * The behaviour that still matters here — and the reason a failed finish is
   * NOT the "whole-page failure" exception — is that the wizard keeps its state
   * and its own primary button, so the merchant retries with the control they
   * already used rather than with a second one inside a banner.
   */
  it('stays on step 4 with its summary and its own action when the preset fails', async () => {
    const user = userEvent.setup();
    await atSummary();
    onboardingService.completeOnboarding.mockRejectedValue({
      code: 'server_error',
      message: 'Something went wrong.',
      details: {},
      requestId: 'req_4',
      status: 500,
      warnings: [],
    });

    renderWithProviders(<OnboardingStepPageContent step={4} />);
    await user.click(screen.getByRole('button', { name: /Start using/ }));

    await waitFor(() => expect(onboardingService.completeOnboarding).toHaveBeenCalledTimes(1));
    expect(replace).not.toHaveBeenCalledWith('/parties');
    // The step is still on screen and still submittable …
    expect(screen.getByRole('button', { name: /Start using/ })).toBeInTheDocument();
    // … and the screen itself reports nothing.
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
    expect(screen.queryByText('req_4')).not.toBeInTheDocument();
  });
});

describe('the wizard — Hindi', () => {
  it('renders step 1 in Hindi, including the type tiles', async () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />, {
      locale: 'hi',
      messages: hi as Record<string, string>,
    });

    // Twice: once as the stepper's label for step 1, once as the card title.
    expect(screen.getAllByText('अपने व्यापार के बारे में बताएँ').length).toBeGreaterThan(0);
    expect(screen.getByRole('radio', { name: /खुदरा दुकान/ })).toBeInTheDocument();
    // The state list is a constant, not a locale file, and is Hindi too. It has
    // to be opened to be asserted now: `UbCombobox` renders its options into a
    // popover on demand, where a native `<select>` kept all 38 in the document
    // whether or not anyone looked at them.
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: /राज्य/ }));
    expect(await screen.findByRole('option', { name: 'महाराष्ट्र' })).toBeInTheDocument();
  });
});

/**
 * CR-2026-09-19-F — the page, as against the forms on it.
 *
 * Layout A, the full-height rail, replaced a centred column with the step list
 * floating beside it. Each assertion below is one of the four things the review
 * rejected, turned into something that fails if it comes back.
 */
describe('the wizard — the page is a rail and a form half (layout A)', () => {
  it('carries the steps in a rail, not floating beside a card', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    const rail = screen.getByRole('complementary', { name: en['onboarding.rail.label'] as string });

    // The three things the rail carries: the mark, the four steps, the line of
    // reassurance that Zoho puts in an illustrated panel we do not have.
    expect(within(rail).getByRole('img', { name: 'DigiKhaato' })).toBeInTheDocument();
    expect(within(rail).getAllByRole('listitem')).toHaveLength(4);
    expect(within(rail).getByText(en['onboarding.rail.reassurance'] as string)).toBeInTheDocument();
  });

  it('gives the rail the full viewport height and only shows it from lg', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    const rail = screen.getByRole('complementary', { name: en['onboarding.rail.label'] as string });

    expect(rail.className).toContain('hidden');
    expect(rail.className).toContain('lg:flex');
    // Full height, and pinned, so the steps do not scroll away from the form.
    expect(rail.className).toContain('lg:h-dvh');
    expect(rail.className).toContain('lg:sticky');
  });

  it('marks the step you are on inside the rail, and only that one', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    const rail = screen.getByRole('complementary', { name: en['onboarding.rail.label'] as string });
    const current = within(rail)
      .getAllByRole('listitem')
      .filter((item) => item.getAttribute('aria-current') === 'step');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(en['onboarding.step1.title'] as string);
  });

  it('collapses to a slim named bar above the form below lg', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    const bar = screen.getByRole('progressbar');

    // A name AND a value: "how far am I" without reading the screen.
    expect(bar).toHaveAccessibleName(`Step 1 of 4 — ${en['onboarding.step1.title'] as string}`);
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    // It is the rail's stand-in, so it goes away exactly where the rail starts.
    expect(bar.parentElement?.parentElement?.className).toContain('lg:hidden');

    // Above the form, not below it.
    const firstField = screen.getByLabelText(/Business name/);
    expect(bar.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('caps the form at a readable measure and centres it in its half', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    const main = screen.getByRole('main');

    expect(main.className).toContain('max-w-[560px]');
    expect(main.className).toContain('mx-auto');
    // NOT `lg:mx-0`. That pinned a 560px form to the left edge of a column over
    // 1100px wide on a 1440 screen, leaving ~560px of empty page to its right —
    // reported as "too much spacing on the right side". The cap is right; the
    // anchoring was not.
    expect(main.className).not.toContain('lg:mx-0');
  });

  it('leaves the sticky Continue bar enough slack to stop clipping a field', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    const main = screen.getByRole('main');

    // `pb-28` is 112 px against an action bar of ~69 px, so the last control
    // always scrolls clear of it. This is the overflow defect, as a test.
    expect(main.className).toContain('pb-28');
    // The form half is its own scroll container at lg, which is what that
    // padding is the bottom of.
    expect(main.parentElement?.className).toContain('lg:overflow-y-auto');
  });

  it('has no footer — the owner removed the pickers and the copyright line', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('keeps the page a page: one main, one h1 above the step h2', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);

    expect(screen.getAllByRole('main')).toHaveLength(1);

    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent(en['onboarding.title'] as string);
    // The step is the section beneath it — level 2, with nothing skipped.
    expect(
      screen.getByRole('heading', { level: 2, name: en['onboarding.step1.title'] as string })
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 4 })).toHaveLength(0);
  });
});

describe('the wizard — step 1 no longer belongs to its tiles', () => {
  it('asks the two typed fields first and leaves the tiles a section beneath', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);

    const name = screen.getByLabelText(/Business name/);
    const state = screen.getByLabelText(/^State/);
    const tiles = screen.getByRole('radiogroup', { name: 'What kind of business?' });

    // The state used to be stranded BELOW the nine tiles. It is a select, not a
    // tile, and it belongs with the other thing the merchant types.
    expect(name.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(state.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // And they are one group, not two fields adrift above a grid.
    expect(name.closest('.rounded-card')).toBe(state.closest('.rounded-card'));
  });

  it('lets the tile grid follow the width it has: 1, then 2, then 3', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    const tiles = screen.getByRole('radiogroup', { name: 'What kind of business?' });

    // One column at 360 px — two 160 px tiles wrap a label and a hint to four
    // ragged lines each, nine times over.
    expect(tiles.className).toContain('grid-cols-1');
    expect(tiles.className).toContain('sm:grid-cols-2');
    // The third column arrives with the rail, because from there it is the
    // form's measure and not the viewport that decides how many fit.
    expect(tiles.className).toContain('lg:grid-cols-3');
  });

  it('keeps every tile at the 44 px target', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    for (const tile of screen.getAllByRole('radio')) {
      expect(tile.className).toContain('min-h-[88px]');
    }
  });
});

/**
 * Defect NEW-1 (High) — "after step 1 is submitted, a browser refresh shows
 * step 1 empty again, and re-submitting creates a SECOND business".
 *
 * The wizard's only memory of the business it had created was the slice's
 * `tenantId` and its idempotency key, and a reload loses both. These tests
 * reproduce a reload the way the app experiences one: an empty onboarding
 * slice, and a session (`GET /auth/me`) whose active business is the one step
 * 1 created.
 */
describe('the wizard — a reload mid-way (NEW-1)', () => {
  const sessionWith = (activeTenant: Record<string, unknown> | null) => ({
    user: { id: 'u1', name: 'Ramesh', mobile: '+919876543210', locale: 'en' },
    activeTenant,
    tenants: activeTenant ? [activeTenant] : [],
    permissions: [],
    enabledModules: [],
    version: null,
  });
  const ownerTenant = (onboardingStep: number, role = 'owner') => ({
    id: 't1',
    name: 'Sharma General Store',
    timezone: 'Asia/Kolkata',
    role,
    onboardingStep,
  });
  const reloadWithSession = async (activeTenant: Record<string, unknown> | null) => {
    authService.getSession.mockResolvedValue(sessionWith(activeTenant));
    await store.dispatch(fetchSession());
    // What a reload does to the wizard: nothing it held in memory survives.
    store.dispatch(resetOnboarding());
  };

  afterEach(async () => {
    // Unmount first: restoring the session re-renders anything still mounted.
    cleanup();
    authService.getSession.mockResolvedValue(sessionWith(null));
    await store.dispatch(fetchSession());
  });

  it('shows the saved business on step 1 and PATCHes it — no second business', async () => {
    const user = userEvent.setup();
    await reloadWithSession(ownerTenant(1));
    onboardingService.fetchCurrentTenant.mockResolvedValue(tenant());
    onboardingService.updateBusinessStep.mockResolvedValue({ tenant: tenant(), warnings: [] });

    renderWithProviders(<OnboardingStepPageContent step={1} />);

    // The saved values, not an empty form.
    await waitFor(() =>
      expect(screen.getByLabelText(/Business name/)).toHaveValue('Sharma General Store')
    );
    expect(screen.getByRole('radio', { name: /Retail shop/ })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onboardingService.updateBusinessStep).toHaveBeenCalledTimes(1));
    expect(onboardingService.createTenant).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/onboarding/step/2');
  });

  it('keeps a reload on step 3 on step 3, instead of throwing the merchant back to step 1', async () => {
    await reloadWithSession(ownerTenant(2));
    onboardingService.fetchCurrentTenant.mockResolvedValue(tenant({ onboardingStep: 2 }));

    renderWithProviders(<OnboardingStepPageContent step={3} />);

    expect(
      await screen.findByRole('heading', { level: 2, name: en['onboarding.step3.title'] as string })
    ).toBeInTheDocument();
    expect(store.getState().onboarding.step).toBe(3);
    expect(store.getState().onboarding.completedStep).toBe(2);
  });

  it('does not draw a step until the saved business is back', async () => {
    await reloadWithSession(ownerTenant(1));
    let answer: (value: unknown) => void = () => undefined;
    onboardingService.fetchCurrentTenant.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );

    renderWithProviders(<OnboardingStepPageContent step={1} />);

    // An empty form mounted now would keep its empty values after the read.
    expect(screen.queryByLabelText(/Business name/)).not.toBeInTheDocument();
    answer(tenant());
    await waitFor(() =>
      expect(screen.getByLabelText(/Business name/)).toHaveValue('Sharma General Store')
    );
  });

  it('falls back to an empty step 1 when the read fails, rather than hanging', async () => {
    await reloadWithSession(ownerTenant(1));
    onboardingService.fetchCurrentTenant.mockRejectedValue({
      code: 'server_error',
      message: 'Something went wrong.',
      details: {},
      requestId: 'req_r',
      status: 500,
      warnings: [],
    });

    renderWithProviders(<OnboardingStepPageContent step={1} />);

    expect(await screen.findByLabelText(/Business name/)).toHaveValue('');
    expect(onboardingService.fetchCurrentTenant).toHaveBeenCalledTimes(1);
  });

  it('does not resume a FINISHED business — "Add a business" starts empty', async () => {
    await reloadWithSession(ownerTenant(4));

    renderWithProviders(<OnboardingStepPageContent step={1} />);

    expect(screen.getByLabelText(/Business name/)).toHaveValue('');
    expect(onboardingService.fetchCurrentTenant).not.toHaveBeenCalled();
  });

  it('does not resume a business the caller does not own', async () => {
    await reloadWithSession(ownerTenant(1, 'staff'));

    renderWithProviders(<OnboardingStepPageContent step={1} />);

    expect(screen.getByLabelText(/Business name/)).toHaveValue('');
    expect(onboardingService.fetchCurrentTenant).not.toHaveBeenCalled();
  });

  const fillStepOne = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/Business name/), 'Sharma General Store');
    await user.click(screen.getByRole('radio', { name: /Retail shop/ }));
    await chooseOption(user, /^State/, /Maharashtra/);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
  };

  it('presents the SAME idempotency key after a reload, so a lost 201 is replayed', async () => {
    const user = userEvent.setup();
    onboardingService.createTenant.mockRejectedValue(new Error('the 201 was lost'));

    const first = renderWithProviders(<OnboardingStepPageContent step={1} />);
    await fillStepOne(user);
    await waitFor(() => expect(onboardingService.createTenant).toHaveBeenCalledTimes(1));
    const keyBeforeReload = onboardingService.createTenant.mock.calls[0]?.[1] as string;
    first.unmount();

    // The reload: the slice — where the key used to live — is wiped.
    store.dispatch(resetOnboarding());
    expect(store.getState().onboarding.tenantCreateKey).toBeNull();

    onboardingService.createTenant.mockResolvedValue({ tenant: tenant(), warnings: [] });
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    await fillStepOne(user);
    await waitFor(() => expect(onboardingService.createTenant).toHaveBeenCalledTimes(2));

    expect(onboardingService.createTenant.mock.calls[1]?.[1]).toBe(keyBeforeReload);
  });

  it('forgets the key once the business exists, so "Add a business" cannot replay it', async () => {
    const user = userEvent.setup();
    onboardingService.createTenant.mockResolvedValue({ tenant: tenant(), warnings: [] });

    renderWithProviders(<OnboardingStepPageContent step={1} />);
    expect(window.localStorage.getItem('ub.onboarding.tenantCreateKey')).not.toBeNull();
    await fillStepOne(user);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/step/2'));
    const usedKey = JSON.stringify(onboardingService.createTenant.mock.calls[0]?.[1]);
    expect(window.localStorage.getItem('ub.onboarding.tenantCreateKey')).not.toBe(usedKey);
  });

  it('goes on from where a business the SERVER resumed had got to, not back to step 2', async () => {
    // The client could not resume (say the read failed) and POSTed step 1; the
    // server's NEW-1 guard answered with the existing business, at step 3.
    const user = userEvent.setup();
    onboardingService.createTenant.mockResolvedValue({
      tenant: tenant({ onboardingStep: 3 }),
      warnings: [],
    });

    renderWithProviders(<OnboardingStepPageContent step={1} />);
    await fillStepOne(user);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/step/4'));
    expect(push).not.toHaveBeenCalledWith('/onboarding/step/2');
  });

  it('replaces a key the server calls spent (idempotency_conflict) and retries once', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('ub.onboarding.tenantCreateKey', JSON.stringify('spent-key'));
    onboardingService.createTenant
      .mockRejectedValueOnce({
        code: 'idempotency_conflict',
        message: 'This key was used with a different request.',
        details: {},
        requestId: 'req_c',
        status: 409,
        warnings: [],
      })
      .mockResolvedValueOnce({ tenant: tenant(), warnings: [] });

    renderWithProviders(<OnboardingStepPageContent step={1} />);
    await fillStepOne(user);

    await waitFor(() => expect(onboardingService.createTenant).toHaveBeenCalledTimes(2));
    expect(onboardingService.createTenant.mock.calls[0]?.[1]).toBe('spent-key');
    expect(onboardingService.createTenant.mock.calls[1]?.[1]).not.toBe('spent-key');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/step/2'));
  });
});
