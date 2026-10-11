import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetSession } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { resetAuth } from '../redux/authSlice';

import { OtpSignInPageContent } from './OtpSignInPageContent';

/**
 * Owner, 9 Oct 2026 — "for registration and login use only mobile number and
 * OTP … also handle proper resend OTP logic … timer of 2 min". Route content →
 * hook → thunk → service, with the service stubbed at the module boundary.
 *
 * What each test prevents is in its name; the resend tests drive the clock
 * with fake timers, because "Resend unlocks at 2:00" is a statement about
 * time and a test that waited for it would be a two-minute test.
 */
jest.mock('../api/authService');

const authService = jest.requireMock('../api/authService') as {
  requestOtp: jest.Mock;
  verifyOtp: jest.Mock;
  getSession: jest.Mock;
};

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/login',
}));

const CHALLENGE = {
  challengeId: 'c-1',
  expiresIn: 600,
  retryAfter: 60,
  codeLength: 4,
  channel: 'sms',
};

const otpError = (reason: string, attemptsLeft: number) => ({
  code: 'otp_invalid',
  message: 'Incorrect or expired code.',
  details: { reason, attempts_left: attemptsLeft },
  requestId: 'req-1',
  status: 400,
  warnings: [],
});

beforeEach(() => {
  store.dispatch(resetAuth());
  store.dispatch(resetSession());
  jest.clearAllMocks();
  authService.requestOtp.mockResolvedValue(CHALLENGE);
  authService.getSession.mockResolvedValue({
    user: { id: 'u1', name: '', email: '', mobile: '+919845011122', locale: 'en' },
    activeTenant: null,
    tenants: [],
    permissions: [],
    enabledModules: [],
    version: null,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

/** Type the number and press Send code; returns the user for the next step. */
const toCodeStep = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/Mobile number/), '9845011122');
  await user.click(screen.getByRole('button', { name: 'Send code' }));
  await screen.findByRole('heading', { name: 'Enter the code' });
};

describe('OtpSignInPageContent — the number', () => {
  it('asks only for a mobile number: no email, no password, no country picker', () => {
    renderWithProviders(<OtpSignInPageContent mode="signIn" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Mobile number/)).toBeInTheDocument();
    expect(screen.getByText('+91')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Email/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
    // The sign-in code is sent to India only; 242 other codes would be 242 dead ends.
    expect(screen.queryByRole('combobox', { name: 'Country code' })).not.toBeInTheDocument();
  });

  it('sends the code to the number in E.164', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OtpSignInPageContent mode="signIn" />);
    await toCodeStep(user);
    expect(authService.requestOtp).toHaveBeenCalledWith(
      expect.objectContaining({ mobile: '+919845011122' })
    );
    expect(screen.getByText(/We sent a 4-digit code to \+91 98450 11122/)).toBeInTheDocument();
  });

  it('draws as many boxes as the SERVER sent digits, whatever the build guessed', async () => {
    // Review G2: this build was made for the four-digit SMS provider, and the
    // server it talks to is running MiniMoth's six. The screen used to draw
    // four boxes, submit on the fourth, and refuse every code it was sent.
    authService.requestOtp.mockResolvedValue({ ...CHALLENGE, codeLength: 6 });
    authService.verifyOtp.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderWithProviders(<OtpSignInPageContent mode="signIn" />);
    await toCodeStep(user);
    expect(screen.getByText(/We sent a 6-digit code to/)).toBeInTheDocument();
    expect(screen.getByLabelText('Digit 6 of 6')).toBeInTheDocument();
    screen.getByLabelText('Digit 1 of 6').focus();
    // With four boxes this paste was cut to 9322 and sent: a wrong code.
    await user.paste('932234');
    await waitFor(() =>
      expect(authService.verifyOtp).toHaveBeenCalledWith(
        expect.objectContaining({ code: '932234' })
      )
    );
  });

  it('refuses a short number before asking the server', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OtpSignInPageContent mode="signIn" />);
    await user.type(screen.getByLabelText(/Mobile number/), '98450');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('Enter a 10-digit Indian mobile number.')).toBeInTheDocument();
    expect(authService.requestOtp).not.toHaveBeenCalled();
  });

  it('words the same flow as sign-up on /signup, with the terms line', () => {
    renderWithProviders(<OtpSignInPageContent mode="signUp" />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Create your account' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('OtpSignInPageContent — the code', () => {
  it('verifies by itself when the fourth digit lands, then routes', async () => {
    authService.verifyOtp.mockResolvedValue({
      userId: 'u1',
      name: '',
      email: '919845011122@mobile.invalid',
      mobile: '+919845011122',
      locale: 'en',
      isNew: true,
      hasPassword: false,
      mustChangePassword: false,
      passwordExpiresAt: null,
      activeTenantId: null,
      tenants: [],
      permissions: [],
      enabledModules: [],
      landing: null,
    });
    const user = userEvent.setup();
    renderWithProviders(<OtpSignInPageContent mode="signUp" />);
    await toCodeStep(user);

    await user.keyboard('4829');

    await waitFor(() =>
      expect(authService.verifyOtp).toHaveBeenCalledWith(
        expect.objectContaining({ challengeId: 'c-1', code: '4829' })
      )
    );
    // A new number is a new account, and a new account starts onboarding.
    await waitFor(() => expect(replace).toHaveBeenCalled());
  });

  it('says how many tries are left after a wrong code', async () => {
    authService.verifyOtp.mockRejectedValue(otpError('incorrect', 3));
    const user = userEvent.setup();
    renderWithProviders(<OtpSignInPageContent mode="signIn" />);
    await toCodeStep(user);
    await user.keyboard('1111');
    expect(await screen.findByText('Wrong code. 3 tries left.')).toBeInTheDocument();
    // The cells empty, so the next code is typed rather than edited over.
    await waitFor(() =>
      screen.getAllByRole('textbox').forEach((cell) => expect(cell).toHaveValue(''))
    );
  });

  it('says to ask for a new code when this one can no longer work', async () => {
    authService.verifyOtp.mockRejectedValue(otpError('expired', 0));
    const user = userEvent.setup();
    renderWithProviders(<OtpSignInPageContent mode="signIn" />);
    await toCodeStep(user);
    await user.keyboard('1111');
    expect(
      await screen.findByText("This code can't be used any more. Tap Resend code for a new one.")
    ).toBeInTheDocument();
  });

  it('goes back to the number on "Change number", keeping nothing of the code', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OtpSignInPageContent mode="signIn" />);
    await toCodeStep(user);
    await user.click(screen.getByRole('button', { name: 'Change number' }));
    expect(await screen.findByLabelText(/Mobile number/)).toBeInTheDocument();
    expect(screen.queryByText(/We sent a 4-digit code/)).not.toBeInTheDocument();
  });
});

describe('OtpSignInPageContent — resend after sixty seconds', () => {
  it('counts down from 1:00 and only then offers "Resend code"', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-09T10:00:00Z'), doNotFake: ['queueMicrotask'] });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProviders(<OtpSignInPageContent mode="signIn" />);
    await toCodeStep(user);

    // Never "2:01": the countdown rounds up, and a 60-second timer is capped at 1:00.
    expect(screen.getByText(/Resend code in (1:00|0:59)/)).toBeInTheDocument();
    expect(screen.queryByText(/Resend code in 1:0[1-9]/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resend code' })).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(31_000);
    });
    expect(screen.getByText(/Resend code in 0:2\d/)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    const resend = await screen.findByRole('button', { name: 'Resend code' });

    await user.click(resend);
    expect(authService.requestOtp).toHaveBeenCalledTimes(2);
    expect(authService.requestOtp).toHaveBeenLastCalledWith(
      expect.objectContaining({ mobile: '+919845011122' })
    );
    // A new code restarts the two minutes.
    expect(await screen.findByText(/Resend code in (1:00|0:59)/)).toBeInTheDocument();
  });

  it('moves the countdown when the server says a resend came too early', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-09T10:00:00Z'), doNotFake: ['queueMicrotask'] });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProviders(<OtpSignInPageContent mode="signIn" />);
    await toCodeStep(user);
    act(() => {
      jest.advanceTimersByTime(61_000);
    });
    authService.requestOtp.mockRejectedValueOnce({
      code: 'otp_throttled',
      message: 'Too many attempts.',
      details: { retry_after: 45 },
      requestId: 'req-2',
      status: 429,
      warnings: [],
    });
    await user.click(await screen.findByRole('button', { name: 'Resend code' }));
    expect(await screen.findByText(/Resend code in 0:4\d/)).toBeInTheDocument();
  });
});
