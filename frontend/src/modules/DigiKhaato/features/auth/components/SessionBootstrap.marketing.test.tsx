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
