import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

import { errorMessageId, shouldToast, toApiError } from './apiError';

/**
 * QA defect D2 (Sprint 3): a failure with no response at all — the server is
 * down, the connection dropped, a timeout — showed an error state with NO
 * reference, although the client had minted an `X-Request-Id` for that very
 * request (`AxiosInstances`' request interceptor). The id is the only thing
 * that connects a merchant's screenshot to a log line (Part 22 §22.1), and the
 * failures with no response are the ones where the server may have logged
 * the request and the client never heard back.
 */
const configWith = (headers: AxiosHeaders | Record<string, string>): InternalAxiosRequestConfig =>
  ({ headers, url: '/parties/p1', method: 'get' }) as unknown as InternalAxiosRequestConfig;

describe('toApiError — the request id when the server did not answer (D2)', () => {
  it('uses the X-Request-Id the client sent when there is no response', () => {
    const error = new AxiosError(
      'Network Error',
      'ERR_NETWORK',
      configWith(new AxiosHeaders({ 'X-Request-Id': 'req_abc' }))
    );

    const shape = toApiError(error);

    expect(shape.code).toBe('network_error');
    expect(shape.requestId).toBe('req_abc');
  });

  it('reads it from a plain header object too, and on a timeout', () => {
    const error = new AxiosError(
      'timeout of 15000ms exceeded',
      'ECONNABORTED',
      configWith({ 'X-Request-Id': 'req_abc' })
    );

    const shape = toApiError(error);

    expect(shape.code).toBe('timeout');
    expect(shape.requestId).toBe('req_abc');
  });

  it('prefers the id the server echoed over the one the client sent', () => {
    const config = configWith(new AxiosHeaders({ 'X-Request-Id': 'req_client' }));
    const error = new AxiosError('Server Error', 'ERR_BAD_RESPONSE', config, undefined, {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'x-request-id': 'req_server' },
      config,
      data: {},
    });

    expect(toApiError(error).requestId).toBe('req_server');
  });

  it('falls back to the client id on a response without one (a proxy page)', () => {
    const config = configWith(new AxiosHeaders({ 'X-Request-Id': 'req_abc' }));
    const error = new AxiosError('Bad Gateway', 'ERR_BAD_RESPONSE', config, undefined, {
      status: 502,
      statusText: 'Bad Gateway',
      headers: {},
      config,
      data: '<html>502</html>',
    });

    expect(toApiError(error).requestId).toBe('req_abc');
  });

  it('is still null when nothing minted an id', () => {
    const error = new AxiosError('Network Error', 'ERR_NETWORK', configWith({}));
    expect(toApiError(error).requestId).toBeNull();
  });
});

/**
 * Sprint 12 i18n sweep: a response with no error body (a proxy's 502 page, an
 * HTML 404) carried the client's own English fallback sentence as its
 * `message`, and `errorMessageId` passed it through as though the server had
 * localised it — so a Hindi merchant's snackbar read "Request failed." A
 * server-sent sentence still passes through untouched.
 */
describe('errorMessageId — the client-minted fallbacks resolve to a key', () => {
  const config = configWith({});
  const reply = (status: number, data: unknown) =>
    new AxiosError('x', 'ERR_BAD_RESPONSE', config, undefined, {
      status,
      statusText: '',
      headers: {},
      config,
      data,
    });

  it.each([502, 404])('maps a body-less %i to error.generic', (status) => {
    expect(errorMessageId(toApiError(reply(status, '<html></html>')))).toBe('error.generic');
  });

  it("keeps the server's own (already localised) sentence", () => {
    const shape = toApiError(
      reply(400, { error: { code: 'validation_failed', message: 'राशि दर्ज करें।' } })
    );
    expect(errorMessageId(shape)).toBeNull();
    expect(shape.message).toBe('राशि दर्ज करें।');
  });

  it('reads a support-session refusal as "view only", in the reader\'s language', () => {
    /* CR-2026-09-29-SEC-A: the server has no Hindi catalogue, and a support
       operator meets this on every write. It must not read as "ask your owner
       for permission", which no owner can grant. */
    const shape = toApiError(
      reply(403, {
        error: {
          code: 'impersonation_forbidden',
          message: 'This is a view-only support session. Nothing can be changed.',
        },
      })
    );
    expect(shape.code).toBe('impersonation_forbidden');
    expect(errorMessageId(shape)).toBe('errors.impersonation_forbidden');
  });
});

describe('shouldToast — refusals a dialog already explains stay out of the snackbar', () => {
  it('keeps both archive refusals in their dialog (A6)', () => {
    /* The A6 look pass caught `party_has_open_records` toasting the server's
       English fallback and a request id over the dialog that named the module,
       the count and the next step. */
    for (const code of ['party_balance_nonzero', 'party_has_open_records'] as const) {
      expect(
        shouldToast({ code, message: 'x', details: {}, requestId: 'r', status: 409, warnings: [] })
      ).toBe(false);
    }
  });
});
