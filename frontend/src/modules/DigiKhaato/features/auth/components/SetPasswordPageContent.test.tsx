import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { Landing } from 'src/types/landing.types';

import { SetPasswordPageContent } from './SetPasswordPageContent';

/**
 * docs/platform/14 R1 — "Set your password" sent EVERYONE to onboarding step 1
 * afterwards, so a person who had just been added to a business they work in
 * was asked to create a new one. It now goes where the session belongs, which
 * the server decided (`landing`).
 */
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace }),
  usePathname: () => '/set-password',
  useSearchParams: () => new URLSearchParams(),
}));

const signIn = (landing: Landing): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Ravi',
        email: 'ravi@verma.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Verma Finance', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Verma Finance', timezone: 'Asia/Kolkata' }],
      permissions: [],
      enabledModules: ['lending'],
      version: 1,
      landing,
    })
  );
};

beforeEach(() => {
  store.dispatch(resetAllFeatureState());
  replace.mockClear();
});

describe('SetPasswordPageContent', () => {
  it('skipping goes to the business they belong to, not the wizard', async () => {
    signIn({ kind: 'app', tenantId: 't1' });
    renderWithProviders(<SetPasswordPageContent />);
    await userEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(replace).not.toHaveBeenCalledWith(expect.stringContaining('/onboarding'));
  });

  it('an owner with their own setup to finish resumes it where the server says', async () => {
    signIn({ kind: 'business_setup', tenantId: 't1', step: 3 });
    renderWithProviders(<SetPasswordPageContent />);
    await userEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(replace).toHaveBeenCalledWith('/onboarding/step/3');
  });
});
