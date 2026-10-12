import { render } from '@testing-library/react';

import { GooglePublicTracker } from './GooglePublicTracker';
let mockPath = '/solutions/shop-billing';
jest.mock('next/navigation', () => ({ usePathname: () => mockPath }));
jest.mock('src/constants', () => ({ ANALYTICS_ENABLED: true, GA4_MEASUREMENT_ID: 'G-TEST123' }));
beforeEach(() => {
  document.getElementById('yourkhata-ga4')?.remove();
  Reflect.deleteProperty(window, 'dataLayer');
  Reflect.deleteProperty(window, 'gtag');
  mockPath = '/solutions/shop-billing';
});
it('loads one tag and sends only public pathname data, disabling it on exit', () => {
  const { rerender, unmount } = render(<GooglePublicTracker />);
  rerender(<GooglePublicTracker />);
  expect(document.querySelectorAll('#yourkhata-ga4')).toHaveLength(1);
  const queue = Reflect.get(window, 'dataLayer') as ArrayLike<unknown>[];
  const events = queue.filter((event) => event[0] === 'event');
  expect(events).toHaveLength(1);
  expect(events[0]?.[2]).toMatchObject({ page_location: 'http://localhost/solutions/shop-billing' });
  unmount();
  expect(Reflect.get(window, 'ga-disable-G-TEST123')).toBe(true);
});
it.each(['/login', '/d/private-token', '/parties/customer-id', '/admin', '/pay/private-token'])(
  'never initializes on %s',
  (path) => {
    mockPath = path;
    render(<GooglePublicTracker />);
    expect(document.getElementById('yourkhata-ga4')).toBeNull();
    expect(Reflect.get(window, 'dataLayer')).toBeUndefined();
  }
);
