import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { resetNotifications } from '../redux/notificationSlice';
import { fetchUnreadCount } from '../redux/notificationThunk';
import { badgeText, safeRoute, titleView } from '../view-model/notificationDisplay';

import { NotificationBell } from './NotificationBell';

import type { AppNotification } from '../types/notification.types';

/**
 * NTF-01 — the bell and its panel. What these protect: a badge that shows "0"
 * or "12" (§7 says nothing at zero and "9+" past nine), a row that opens a URL
 * the payload chose rather than an in-app path (§19), and "Mark all as read"
 * leaving the badge behind.
 */
jest.mock('../api/notificationService');

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/parties',
}));

const service = jest.requireMock('../api/notificationService') as {
  getUnreadCount: jest.Mock;
  listNotifications: jest.Mock;
  markNotificationRead: jest.Mock;
  markAllNotificationsRead: jest.Mock;
};

const DUE: AppNotification = {
  id: 'n1',
  type: 'reminder_due',
  category: 'reminders',
  severity: 'info',
  title: '3 parties have a payment due today',
  body: 'Open the list to remind them.',
  count: 3,
  route: '/ledger/reminders?bucket=today',
  params: {},
  isRead: false,
  createdAt: new Date().toISOString(),
};

beforeAll(async () => {
  await import('./NotificationPanel');
}, 30_000);

beforeEach(() => {
  jest.clearAllMocks();
  store.dispatch(resetNotifications());
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@shop.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' }],
      permissions: ['ledger.entry.read'],
      enabledModules: ['parties', 'ledger'],
      version: 1,
    })
  );
  service.listNotifications.mockResolvedValue({
    rows: [DUE],
    nextCursor: null,
    hasMore: false,
    unreadCount: 1,
  });
  service.markNotificationRead.mockResolvedValue(undefined);
  service.markAllNotificationsRead.mockResolvedValue(1);
});

describe('badgeText', () => {
  it('shows nothing at zero or before the first count, 1–9, then 9+', () => {
    expect(badgeText(null)).toBeNull();
    expect(badgeText(0)).toBeNull();
    expect(badgeText(9)).toBe('9');
    expect(badgeText(12)).toBe('9+');
  });
});

describe('safeRoute / titleView', () => {
  it('follows only an in-app path', () => {
    expect(safeRoute('/ledger/reminders?bucket=today')).toBe('/ledger/reminders?bucket=today');
    expect(safeRoute('https://evil.test')).toBe('/');
    expect(safeRoute('//evil.test')).toBe('/');
  });

  it('falls back to the server’s English for a type this client has no words for', () => {
    expect(titleView({ ...DUE, type: 'something_new' })).toEqual({
      id: null,
      values: {},
      fallback: DUE.title,
    });
  });
});

describe('the bell', () => {
  it('carries the unread count in its name and in a 9+ badge', async () => {
    service.getUnreadCount.mockResolvedValue(12);
    renderWithProviders(<NotificationBell />);
    await act(async () => {
      await store.dispatch(fetchUnreadCount());
    });

    expect(
      await screen.findByRole('button', { name: '12 unread notifications' })
    ).toBeInTheDocument();
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('has no badge at zero', async () => {
    service.getUnreadCount.mockResolvedValue(0);
    renderWithProviders(<NotificationBell />);
    await act(async () => {
      await store.dispatch(fetchUnreadCount());
    });

    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('opens the inbox, marks a row read on open and goes to its in-app route', async () => {
    service.getUnreadCount.mockResolvedValue(1);
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await act(async () => {
      await store.dispatch(fetchUnreadCount());
    });

    await user.click(await screen.findByRole('button', { name: '1 unread notification' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    const row = await within(panel).findByText('3 customers have a payment due today');
    await user.click(row);

    await waitFor(() => expect(service.markNotificationRead).toHaveBeenCalledWith('n1'));
    expect(mockPush).toHaveBeenCalledWith('/ledger/reminders?bucket=today');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    );
  });

  it('clears the badge with Mark all as read', async () => {
    service.getUnreadCount.mockResolvedValue(1);
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await act(async () => {
      await store.dispatch(fetchUnreadCount());
    });

    await user.click(await screen.findByRole('button', { name: '1 unread notification' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    await within(panel).findByText('3 customers have a payment due today');
    await user.click(within(panel).getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(service.markAllNotificationsRead).toHaveBeenCalled());
    await waitFor(() => expect(within(panel).queryByText('Unread')).not.toBeInTheDocument());
  });
});
