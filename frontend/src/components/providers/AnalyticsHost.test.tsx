import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import { resetPosthogForTests } from 'src/analytics/posthogClient';
import { AccountMenu } from 'src/components/layout/AccountMenu';
import { resetSession, sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { AnalyticsHost } from './AnalyticsHost';

/**
 * DEC-017 — `AnalyticsHost` decides when the PostHog SDK may load. The SDK is
 * mocked at the module boundary: nothing here reaches the network.
 */
const posthog = {
  init: jest.fn(),
  capture: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
  opt_out_capturing: jest.fn(),
  opt_in_capturing: jest.fn(),
  has_opted_out_capturing: jest.fn(() => false),
  getSurveys: jest.fn((callback: (surveys: unknown[]) => void) => callback(mockSurveys)),
  displaySurvey: jest.fn(),
};
let mockSurveys: { id: string; type: string; end_date?: string | null }[] = [];
jest.mock('posthog-js', () => ({ __esModule: true, default: posthog }));

let mockPath = '/dashboard';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

let mockEnabled = true;
let mockKey = 'phc_test';
let mockMaskText = false;
jest.mock('src/constants', () => ({
  ...jest.requireActual('src/constants'),
  get ANALYTICS_ENABLED() {
    return mockEnabled;
  },
  get POSTHOG_KEY() {
    return mockKey;
  },
  POSTHOG_HOST: 'https://us.i.posthog.com',
  POSTHOG_DEFAULTS: '2026-05-30',
  get POSTHOG_REPLAY_MASK_TEXT() {
    return mockMaskText;
  },
}));

const mount = async (): Promise<void> => {
  renderWithProviders(<AnalyticsHost />);
  // The SDK waits for the page to be idle (a 1.5 s timer in jsdom).
  await act(async () => {
    jest.advanceTimersByTime(1600);
  });
};

const mountAccount = async (): Promise<ReturnType<typeof renderWithProviders>> => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@qa.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Shop', timezone: 'Asia/Kolkata' },
      tenants: [],
      permissions: [],
      enabledModules: [],
      version: 1,
    })
  );
  const view = renderWithProviders(
    <>
      <AnalyticsHost />
      <AccountMenu />
    </>
  );
  await act(async () => {
    jest.advanceTimersByTime(1600);
  });
  return view;
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetPosthogForTests();
  store.dispatch(resetSession());
  mockPath = '/dashboard';
  mockEnabled = true;
  mockKey = 'phc_test';
  mockMaskText = false;
  mockSurveys = [];
});
afterEach(() => jest.useRealTimers());

describe('AnalyticsHost', () => {
  it('never floats Feedback over form inputs and offers it in the account menu (QA B16)', async () => {
    // Feedback must occupy normal navigation space, not the right edge of a form.
    mockSurveys = [{ id: 'sv_1', type: 'popover', end_date: null }];
    await mountAccount();
    await waitFor(() => expect(posthog.getSurveys).toHaveBeenCalled());
    expect(screen.queryByTestId('feedback-tab')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Account menu for Owner' }));
    expect(await screen.findByRole('menuitem', { name: 'Give feedback' })).toBeInTheDocument();
  });

  it('removes account feedback when navigating to a customer document (QA B16)', async () => {
    // A retained callback must not keep a survey available on a protected customer URL.
    mockSurveys = [{ id: 'sv_1', type: 'popover', end_date: null }];
    const view = await mountAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Account menu for Owner' }));
    expect(await screen.findByRole('menuitem', { name: 'Give feedback' })).toBeInTheDocument();
    mockPath = '/d/customer-token';
    view.rerender(
      <>
        <AnalyticsHost />
        <AccountMenu />
      </>
    );
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Give feedback' })).toBeNull()
    );
  });
  it('sends nothing at all unless the build enables it', async () => {
    mockEnabled = false;
    await mount();
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('sends nothing without a project key, whatever the flag says', async () => {
    mockKey = '';
    await mount();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('configures the SDK to mask what is on screen, and reports the page without its query', async () => {
    mockPath = '/customers';
    await mount();
    await waitFor(() => expect(posthog.capture).toHaveBeenCalled());

    const [key, config] = posthog.init.mock.calls[0];
    expect(key).toBe('phc_test');
    // Every screen here is somebody's accounts: a click must not carry the
    // text on the button.
    expect(config).toMatchObject({
      api_host: 'https://us.i.posthog.com',
      defaults: '2026-05-30',
      person_profiles: 'identified_only',
      capture_pageview: false,
      mask_all_text: true,
      mask_all_element_attributes: true,
      session_recording: { maskAllInputs: true },
    });
    // The owner wants to read the screen in a replay, so its text is not
    // masked by default — but nothing anybody TYPES is ever recorded.
    expect(config.session_recording).not.toHaveProperty('maskTextSelector');
    expect(posthog.capture).toHaveBeenCalledWith('$pageview', {
      $current_url: 'http://localhost/customers',
    });
  });

  it('masks every word in a replay again when the build asks for it', async () => {
    mockMaskText = true;
    await mount();
    await waitFor(() => expect(posthog.init).toHaveBeenCalled());
    expect(posthog.init.mock.calls[0][1].session_recording).toEqual({
      maskAllInputs: true,
      maskTextSelector: '*',
    });
  });

  it.each(['/d/2f9c1a7e', '/pay/8b1d', '/reset-password/tok_123', '/in/room-7'])(
    'does not even load the SDK on %s',
    async (path) => {
      // A customer's bill, or an address with a credential in it.
      mockPath = path;
      await mount();
      expect(posthog.init).not.toHaveBeenCalled();
      expect(posthog.capture).not.toHaveBeenCalled();
    }
  );

  /**
   * The Feedback tab (owner, 11 Oct 2026). A PostHog "Popover" survey shows
   * once and is gone for good from that browser when closed; the owner closed
   * his and could not get it back. The tab asks for the same survey again.
   */
  it('opens the running survey repeatedly from the account menu, ignoring already seen', async () => {
    mockSurveys = [{ id: 'sv_1', type: 'popover', end_date: null }];
    await mountAccount();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Account menu for Owner' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Give feedback' }));
    }
    expect(posthog.displaySurvey).toHaveBeenCalledTimes(2);
    expect(posthog.displaySurvey).toHaveBeenCalledWith('sv_1', {
      displayType: 'popover',
      ignoreConditions: true,
      ignoreDelay: true,
    });
  });

  it.each([
    ['there is no survey', []],
    ['the only survey has ended', [{ id: 'sv_1', type: 'popover', end_date: '2026-10-01' }]],
    // PostHog's own "Feedback button" kind brings its own tab: ours would make two.
    ['PostHog draws its own feedback button', [{ id: 'sv_2', type: 'widget', end_date: null }]],
  ])('offers no account feedback when %s', async (_why, surveys) => {
    mockSurveys = surveys;
    await mountAccount();
    await waitFor(() => expect(posthog.getSurveys).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Account menu for Owner' }));
    expect(screen.queryByRole('menuitem', { name: 'Give feedback' })).toBeNull();
  });

  it("draws no tab on a page a merchant's customer opens", async () => {
    mockSurveys = [{ id: 'sv_1', type: 'popover', end_date: null }];
    mockPath = '/d/2f9c1a7e';
    await mountAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Account menu for Owner' }));
    expect(screen.queryByRole('menuitem', { name: 'Give feedback' })).toBeNull();
  });
});

it('does not let anonymous identity loading bypass the deferred SDK path', async () => {
  mockPath = '/solutions';
  renderWithProviders(<AnalyticsHost />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(posthog.init).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(1600);
  });
  await waitFor(() => expect(posthog.capture).toHaveBeenCalled());
});
