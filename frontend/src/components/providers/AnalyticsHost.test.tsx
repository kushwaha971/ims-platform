import { act, waitFor } from '@testing-library/react';

import { resetPosthogForTests } from 'src/analytics/posthogClient';
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
};
jest.mock('posthog-js', () => ({ __esModule: true, default: posthog }));

let mockPath = '/dashboard';
jest.mock('next/navigation', () => ({ usePathname: () => mockPath }));

let mockEnabled = true;
let mockKey = 'phc_test';
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
}));

const mount = async (): Promise<void> => {
  renderWithProviders(<AnalyticsHost />);
  // The SDK waits for the page to be idle (a 1.5 s timer in jsdom).
  await act(async () => {
    jest.advanceTimersByTime(1600);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetPosthogForTests();
  mockPath = '/dashboard';
  mockEnabled = true;
  mockKey = 'phc_test';
});
afterEach(() => jest.useRealTimers());

describe('AnalyticsHost', () => {
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
    // text on the button, and a replay must not carry the book.
    expect(config).toMatchObject({
      api_host: 'https://us.i.posthog.com',
      defaults: '2026-05-30',
      person_profiles: 'identified_only',
      capture_pageview: false,
      mask_all_text: true,
      mask_all_element_attributes: true,
      session_recording: { maskAllInputs: true, maskTextSelector: '*' },
    });
    expect(posthog.capture).toHaveBeenCalledWith('$pageview', {
      $current_url: 'http://localhost/customers',
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
});
