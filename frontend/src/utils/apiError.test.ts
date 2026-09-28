import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

import { toApiError } from './apiError';

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
