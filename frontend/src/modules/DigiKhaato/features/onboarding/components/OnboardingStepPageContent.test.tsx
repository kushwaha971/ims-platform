import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import hi from 'locales/hi.json';

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
    expect(screen.getByText('Stock, bills, udhaar')).toBeInTheDocument();
  });

  it('creates the tenant and advances to step 2', async () => {
    const user = userEvent.setup();
    onboardingService.createTenant.mockResolvedValue({ tenant: tenant(), warnings: [] });

    renderWithProviders(<OnboardingStepPageContent step={1} />);
    await user.type(screen.getByLabelText(/Business name/), 'Sharma General Store');
    await user.click(screen.getByRole('radio', { name: /Retail shop/ }));
    await user.selectOptions(screen.getByLabelText(/^State/), '27');
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
    await user.selectOptions(screen.getByLabelText(/^State/), '27');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onboardingService.createTenant).not.toHaveBeenCalled());
  });

  it('has no Skip on step 1 — a wizard cannot patch a business that does not exist', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />);
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
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
    expect(screen.getByText('7 days')).toBeInTheDocument();
    expect(screen.getByText('NOS, KGS, GMS, LTR, PAC')).toBeInTheDocument();
    // FR-8 / canon §0.2 — defaults, never hard-wired behaviour.
    expect(screen.getByText('You can change all of this in Settings.')).toBeInTheDocument();
  });

  it('applies the preset and lands on the dashboard', async () => {
    const user = userEvent.setup();
    await atSummary();
    onboardingService.completeOnboarding.mockResolvedValue({
      tenant: tenant({ onboardingStep: 4 }),
      warnings: [],
    });

    renderWithProviders(<OnboardingStepPageContent step={4} />);
    await user.click(screen.getByRole('button', { name: /Start using/ }));

    await waitFor(() => expect(onboardingService.completeOnboarding).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('stays on step 4 with Retry and the request id when the preset fails', async () => {
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

    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByText('req_4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith('/dashboard');
  });
});

describe('the wizard — Hindi', () => {
  it('renders step 1 in Hindi, including the type tiles', () => {
    renderWithProviders(<OnboardingStepPageContent step={1} />, {
      locale: 'hi',
      messages: hi as Record<string, string>,
    });

    // Twice: once as the stepper's label for step 1, once as the card title.
    expect(screen.getAllByText('अपने व्यापार के बारे में बताएँ').length).toBeGreaterThan(0);
    expect(screen.getByRole('radio', { name: /खुदरा दुकान/ })).toBeInTheDocument();
    // The state list is a constant, not a locale file, and is Hindi too.
    expect(screen.getByText('महाराष्ट्र')).toBeInTheDocument();
  });
});
