import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { api, ubConfig, __resetTransportState } from 'src/api/AxiosInstances';
import { SnackbarHost } from 'src/components/layout/SnackbarHost';
import { UB_SNACKBAR_AUTO_HIDE_MS } from 'src/design-system';
import { hideSnackbar } from 'src/redux/slice/snackbarSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { LoginPageContent } from 'modules/DigiKhaato/features/auth/components/LoginPageContent';
import { resetAuth } from 'modules/DigiKhaato/features/auth/redux/authSlice';
import { PartyListPageContent } from 'modules/DigiKhaato/features/parties/components/PartyListPageContent';
import { resetPartyList } from 'modules/DigiKhaato/features/parties/redux/partyListSlice';

/**
 * CR-2026-09-19-E — THE GLOBAL ERROR CHANNEL, end to end.
 *
 * Every other error test in this repo mocks the service module, which is above
 * the transport: those tests can prove that a screen renders nothing of its
 * own, but they cannot prove where the report went instead. This suite drives
 * the REAL axios instance — real request interceptor, real response
 * interceptor, real `toApiError`, real transport host, real store, real
 * `SnackbarHost` — with only the HTTP adapter replaced. It is the only place
 * that can fail if the routing is unplugged.
 *
 * It asserts the rule and each of its four documented exceptions:
 *
 *   RULE        a failing thunk produces a snackbar, and the screen that
 *               triggered it contains no error-rendering code at all.
 *   EXCEPTION 1 `validation_error` goes to the FIELD, never to a toast.
 *   EXCEPTION 2 a whole-page read that failed keeps its in-page error state
 *               and does not toast (`suppressErrorSnackbar`).
 *   EXCEPTION 3 a 401 whose refresh failed is a session expiry: it redirects
 *               and does not also toast.
 *   EXCEPTION 4 a request that opted out via `suppressErrorSnackbar` is silent
 *               on the channel — the flag BrandHub has, with the same meaning.
 *
 * Plus the accessibility contract of the surface itself: assertive for an
 * error, polite for a success, dismissible, and reachable by keyboard.
 */

// ── The HTTP adapter, replaced ───────────────────────────────────────────────

interface Reply {
  readonly status: number;
  readonly data?: unknown;
  readonly headers?: Record<string, string>;
  /** No response at all — a transport failure rather than an HTTP one. */
  readonly network?: boolean;
}

let replies: Reply[] = [];
const requested: InternalAxiosRequestConfig[] = [];

const respond = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  requested.push(config);
  const reply: Reply = replies.shift() ?? { status: 200, data: { data: {} } };

  if (reply.network) {
    throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
  }

  const response: AxiosResponse = {
    data: reply.data ?? {},
    status: reply.status,
    statusText: '',
    headers: new AxiosHeaders(reply.headers ?? {}),
    config,
    request: {},
  };

  if (reply.status >= 200 && reply.status < 300) return response;

  // A custom adapter owns `validateStatus`; the built-in ones call `settle`.
  throw new AxiosError(
    `Request failed with status code ${reply.status}`,
    reply.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
    config,
    {},
    response
  );
};

const errorBody = (code: string, message: string, details?: Record<string, string[]>) => ({
  error: { code, message, request_id: 'req_channel', ...(details ? { details } : {}) },
});

const realAdapter = api.defaults.adapter;
const realLocation = window.location;

beforeAll(() => {
  api.defaults.adapter = respond as typeof api.defaults.adapter;
});

afterAll(() => {
  api.defaults.adapter = realAdapter;
  Object.defineProperty(window, 'location', { value: realLocation, writable: true });
});

beforeEach(() => {
  replies = [];
  requested.length = 0;
  __resetTransportState();
  store.dispatch(hideSnackbar());
  store.dispatch(resetAuth());
  store.dispatch(resetPartyList());
  window.localStorage.clear();
});

const push = jest.fn();
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/login',
}));

const submitLogin = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.type(screen.getByLabelText(/Email address/), 'ramesh@example.com');
  await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'kirana2026');
  await user.click(screen.getByRole('button', { name: 'Log in' }));
};

const SOURCE = (relative: string): string =>
  readFileSync(join(process.cwd(), relative), 'utf8');

// ── The rule ─────────────────────────────────────────────────────────────────

describe('the rule: an API failure surfaces centrally, through the snackbar', () => {
  it('turns a failing thunk into a snackbar carrying the message and the request id', async () => {
    const user = userEvent.setup();
    replies = [
      { status: 500, data: errorBody('server_error', 'The books are briefly unavailable.') },
    ];

    renderWithProviders(
      <>
        <LoginPageContent />
        <SnackbarHost />
      </>
    );
    await submitLogin(user);

    const toast = await screen.findByTestId('snackbar');
    expect(toast).toHaveTextContent('The books are briefly unavailable.');
    // R-E-4 — the trace id travels with the failure, as the banner used to do.
    expect(toast).toHaveTextContent('req_channel');
    // Labelled as the thing to quote, as every error surface labels it (QA B5).
    expect(toast).toHaveTextContent('Reference req_channel');
    // It reached the store's single channel, not some component's local state.
    expect(store.getState().snackbar.snackbarSeverity).toBe('error');
  });

  it('does it with NO error-handling code in the screen that failed', () => {
    const source = SOURCE('src/modules/DigiKhaato/features/auth/components/LoginPageContent.tsx');

    // No toast dispatch, no error banner, no reading of an error off a hook.
    expect(source).not.toContain('showSnackbar');
    expect(source).not.toContain('tone="error"');
    expect(source).not.toContain('error.message');
    expect(source).not.toContain('error.requestId');
  });

  it('holds for every screen outside the (app) group — the host is mounted above them all', () => {
    // The regression this guards is the one that caused the whole change: the
    // host used to hang off `UbAppShell`, which only `(app)` renders, so login,
    // sign-up, reset, onboarding and the public routes had no renderer at all.
    const providers = SOURCE('src/components/providers/AppProviders.tsx');
    expect(providers).toContain('<SnackbarHost />');
    expect(SOURCE('src/components/layout/UbAppShell.tsx')).not.toContain('<SnackbarHost />');
  });

  it('localises a client-minted failure instead of shipping its English fallback', async () => {
    const user = userEvent.setup();
    replies = [{ status: 0, network: true }];

    renderWithProviders(
      <>
        <LoginPageContent />
        <SnackbarHost />
      </>
    );
    await submitLogin(user);

    // `toApiError` mints `network_error` with a hardcoded English sentence,
    // because it sits below the React tree. The slice carries the KEY and the
    // host resolves it — BrandHub's `id`/`params` mechanism.
    await waitFor(() => expect(store.getState().snackbar.id).toBe('error.network'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Could not reach the server. Check your connection and try again.'
    );
  });
});

// ── The four documented exceptions ───────────────────────────────────────────

describe('EXCEPTION 1 — field-level validation belongs on the field', () => {
  it('puts a validation_error under its control and raises no toast', async () => {
    const user = userEvent.setup();
    replies = [
      {
        status: 400,
        data: errorBody('validation_error', 'Please check the highlighted fields.', {
          password: ['That password is too common.'],
        }),
      },
    ];

    renderWithProviders(
      <>
        <LoginPageContent />
        <SnackbarHost />
      </>
    );
    await submitLogin(user);

    expect(await screen.findByText('That password is too common.')).toBeInTheDocument();
    expect(screen.queryByTestId('snackbar')).not.toBeInTheDocument();
    expect(store.getState().snackbar.snackbarOpen).toBe(false);
  });

  it('does the same for a wrong password, which must read identically to an unknown address', async () => {
    const user = userEvent.setup();
    replies = [
      { status: 401, data: errorBody('invalid_credentials', 'Email or password is wrong.') },
    ];

    renderWithProviders(
      <>
        <LoginPageContent />
        <SnackbarHost />
      </>
    );
    await submitLogin(user);

    expect(await screen.findByText('Email or password is wrong.')).toBeInTheDocument();
    expect(screen.queryByTestId('snackbar')).not.toBeInTheDocument();
  });
});

describe('EXCEPTION 2 — a whole-page failure keeps its in-page state', () => {
  it('leaves the list rendering its own error, with no toast to fade away', async () => {
    replies = [{ status: 500, data: errorBody('server_error', 'The books are unavailable.') }];

    renderWithProviders(
      <>
        <PartyListPageContent />
        <SnackbarHost />
      </>
    );

    // The screen says what happened and offers the way back …
    expect(await screen.findByText('req_channel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    // … and the channel stays quiet, because a toast here would disappear and
    // leave an empty screen with no explanation of why it is empty.
    expect(screen.queryByTestId('snackbar')).not.toBeInTheDocument();
    expect(store.getState().snackbar.snackbarOpen).toBe(false);
  });
});

describe('EXCEPTION 3 — a 401 whose refresh failed is a session expiry, reported once', () => {
  it('redirects to login and raises no toast', async () => {
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { ...realLocation, pathname: '/parties', search: '', origin: 'http://localhost', assign },
      writable: true,
    });

    // The original request 401s, then `/auth/refresh` 401s too.
    replies = [
      { status: 401, data: errorBody('token_stale', 'Token expired.') },
      { status: 401, data: errorBody('session_revoked', 'Session revoked.') },
    ];

    await expect(api.get('/parties')).rejects.toBeDefined();

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(String(assign.mock.calls[0]?.[0])).toContain('/login');
    expect(store.getState().session.status).toBe('anonymous');
    expect(store.getState().snackbar.snackbarOpen).toBe(false);
  });
});

describe('EXCEPTION 4 — a request may opt out, as it can in BrandHub', () => {
  it('stays silent when the caller sets suppressErrorSnackbar', async () => {
    replies = [{ status: 500, data: errorBody('server_error', 'Not for the toast.') }];

    await expect(
      api.get('/parties', ubConfig({ suppressErrorSnackbar: true }))
    ).rejects.toBeDefined();

    expect(store.getState().snackbar.snackbarOpen).toBe(false);
  });

  it('and toasts the very same failure when it does not', async () => {
    replies = [{ status: 500, data: errorBody('server_error', 'For the toast.') }];

    await expect(api.get('/parties')).rejects.toBeDefined();

    expect(store.getState().snackbar.snackbarOpen).toBe(true);
    expect(store.getState().snackbar.snackbarMessage).toBe('For the toast.');
  });
});

// ── The surface itself ───────────────────────────────────────────────────────

describe('the toast is announced, dismissible and reachable', () => {
  const renderToast = () => renderWithProviders(<SnackbarHost />);

  it('announces an error ASSERTIVELY — a failure interrupts', async () => {
    replies = [{ status: 500, data: errorBody('server_error', 'Assertive please.') }];
    renderToast();

    await act(async () => {
      await expect(api.get('/parties')).rejects.toBeDefined();
    });

    const toast = await screen.findByTestId('snackbar');
    const region = toast.closest('[aria-live]');
    expect(region).toHaveAttribute('aria-live', 'assertive');
    expect(region).toHaveAttribute('role', 'alert');
  });

  it('announces a success POLITELY — a confirmation waits its turn', async () => {
    renderToast();

    act(() => {
      store.dispatch({
        type: 'snackbar/showSnackbar',
        payload: { severity: 'success', message: 'Polite please.' },
      });
    });

    const toast = await screen.findByTestId('snackbar');
    const region = toast.closest('[aria-live]');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('role', 'status');
  });

  it('is dismissible from the keyboard, by a button with a translated name', async () => {
    const user = userEvent.setup();
    renderToast();

    act(() => {
      store.dispatch({
        type: 'snackbar/showSnackbar',
        payload: { severity: 'error', message: 'Dismiss me.' },
      });
    });

    const dismiss = await screen.findByRole('button', { name: 'Dismiss' });
    dismiss.focus();
    expect(dismiss).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByTestId('snackbar')).not.toBeInTheDocument());
    expect(store.getState().snackbar.snackbarOpen).toBe(false);
  });

  it('auto-hides after BrandHub’s 4 seconds', async () => {
    jest.useFakeTimers();
    try {
      renderToast();

      act(() => {
        store.dispatch({
          type: 'snackbar/showSnackbar',
          payload: { severity: 'info', message: 'Briefly.' },
        });
      });
      expect(screen.getByTestId('snackbar')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(UB_SNACKBAR_AUTO_HIDE_MS);
      });

      expect(screen.queryByTestId('snackbar')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('REPLACES rather than queues, as BrandHub does', async () => {
    renderToast();

    act(() => {
      store.dispatch({
        type: 'snackbar/showSnackbar',
        payload: { severity: 'error', message: 'First.' },
      });
      store.dispatch({
        type: 'snackbar/showSnackbar',
        payload: { severity: 'error', message: 'Second.' },
      });
    });

    const toast = await screen.findByTestId('snackbar');
    // The newest failure is the one the merchant just caused.
    expect(toast).toHaveTextContent('Second.');
    expect(toast).not.toHaveTextContent('First.');
  });
});
