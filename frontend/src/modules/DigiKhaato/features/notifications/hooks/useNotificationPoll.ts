'use client';

import { useEffect } from 'react';

import { useAppDispatch } from 'src/hooks/useAppStore';

import '../redux/notificationSlice';
import { fetchUnreadCount } from '../redux/notificationThunk';

/**
 * NTF-01 FR-8 — the unread count, refreshed on mount, every 60 s while the tab
 * is VISIBLE, and when the window regains focus; a hidden tab polls nothing
 * (§5: "at most one 1 kB request per minute per open tab"). No WebSocket
 * (ADR-021).
 *
 * Mounted ONCE, by the app shell. The bell is drawn twice — the phone header
 * and the desktop bar, one hidden by CSS at any width — and a poll inside the
 * bell would have been two polls.
 */
export const POLL_MS = 60_000;

export const useNotificationPoll = (): void => {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void dispatch(fetchUnreadCount());
    };
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [dispatch]);
};
