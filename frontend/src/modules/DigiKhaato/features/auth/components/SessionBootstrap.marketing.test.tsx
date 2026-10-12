import { render } from '@testing-library/react';

import { SessionBootstrap } from './SessionBootstrap';
const mockDispatch = jest.fn(() => ({ abort: jest.fn() }));
let mockPath = '/solutions';
jest.mock('next/navigation', () => ({ usePathname: () => mockPath }));
jest.mock('src/hooks/useAppStore', () => ({ useAppDispatch: () => mockDispatch }));
jest.mock('../redux/sessionThunk', () => ({ fetchSession: () => ({ type: 'session/fetch' }) }));
beforeEach(() => mockDispatch.mockClear());
it('does not make marketing render depend on the session API', () => {
  mockPath = '/solutions';
  render(<SessionBootstrap>Public page</SessionBootstrap>);
  expect(mockDispatch).not.toHaveBeenCalled();
});
it('still bootstraps a private application route', () => {
  mockPath = '/dashboard';
  render(<SessionBootstrap>App</SessionBootstrap>);
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'session/fetch' });
});
it('reads the session once per page load, not again on every route change (QA B47 / B21)', () => {
  /* Keyed on the pathname, it sent another GET /auth/me per navigation and
     aborted the one before; an abort landing during the refresh signed a
     valid session out. */
  mockPath = '/dashboard';
  const { rerender } = render(<SessionBootstrap>App</SessionBootstrap>);
  mockPath = '/library/members';
  rerender(<SessionBootstrap>App</SessionBootstrap>);
  mockPath = '/parties';
  rerender(<SessionBootstrap>App</SessionBootstrap>);
  expect(mockDispatch).toHaveBeenCalledTimes(1);
});
