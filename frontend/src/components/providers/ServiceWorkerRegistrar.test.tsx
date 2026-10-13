import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';

import { ServiceWorkerRegistrar } from './ServiceWorkerRegistrar';

jest.mock('src/constants', () => ({ ...jest.requireActual('src/constants'), SW_ENABLED: true }));

/**
 * QA B50 — the registrar tells the worker which business is open, and must never
 * say "signed out" merely because the session has not loaded yet: that would
 * delete the cache a launch without signal is about to read.
 */
const postMessage = jest.fn();
const register = jest.fn().mockResolvedValue({});

beforeEach(() => {
  postMessage.mockClear();
  register.mockClear();
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register, ready: Promise.resolve({ active: { postMessage } }) },
  });
});

const mount = () =>
  render(
    <Provider store={store}>
      <ServiceWorkerRegistrar />
    </Provider>
  );

it('registers the worker, marks the page live, and says nothing before a session', async () => {
  mount();
  await act(async () => undefined);
  expect(register).toHaveBeenCalledWith('/sw.js');
  expect(document.documentElement.dataset.hydrated).toBe('true');
  expect(postMessage).not.toHaveBeenCalled();
});

it('names the open business once the session says which it is', async () => {
  mount();
  await act(async () => {
    store.dispatch(
      sessionLoaded({
        user: {
          id: 'u1',
          name: 'Owner',
          email: 'o@x.test',
          mobile: null,
          locale: 'en',
          mustChangePassword: false,
          passwordExpiresAt: null,
        },
        activeTenant: { id: 't9', name: 'Kumar', timezone: 'Asia/Kolkata', role: 'owner' },
        tenants: [{ id: 't9', name: 'Kumar', timezone: 'Asia/Kolkata', role: 'owner' }],
        permissions: [],
        enabledModules: [],
        version: 1,
      })
    );
  });
  await act(async () => undefined);
  expect(postMessage).toHaveBeenCalledWith({ type: 'tenant', id: 't9' });
});
