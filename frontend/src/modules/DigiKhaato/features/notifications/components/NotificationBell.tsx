'use client';

import { useCallback, useRef, useState } from 'react';

import dynamic from 'next/dynamic';

import { Bell } from 'lucide-react';

import { UbBox, UbButton } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';

import { selectUnreadCount } from '../redux/notificationSlice';
import { badgeText } from '../view-model/notificationDisplay';

/**
 * NTF-01 FR-4 — the bell, on every app route, so it is kept to a button and
 * a count; the count is kept fresh by `useNotificationPoll`, mounted once by
 * the shell. The panel (rows, relative times, the read calls) is a `dynamic()`
 * chunk loaded the first time the bell is pressed.
 */
const NotificationPanel = dynamic(
  () => import('./NotificationPanel').then((m) => m.NotificationPanel),
  {
    ssr: false,
  }
);

export function NotificationBell({
  className,
}: Readonly<{ className?: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const count = useAppSelector(selectUnreadCount);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const badge = badgeText(count);

  return (
    <UbBox as="span" className={`relative inline-flex shrink-0 ${className ?? ''}`}>
      <UbButton
        ref={triggerRef}
        variant="ghost"
        iconOnly
        icon={<Bell aria-hidden className="h-5 w-5" />}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="notification-bell"
      >
        {badge
          ? t('notifications.bell.unread', { count: count ?? 0 })
          : t('notifications.bell.label')}
      </UbButton>
      {badge && (
        <UbBox
          as="span"
          aria-hidden
          className="pointer-events-none absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-white"
        >
          {badge}
        </UbBox>
      )}
      {/* The count is announced politely when it changes (§5), without the
          badge's own glyphs being read twice. */}
      <UbBox as="span" role="status" aria-live="polite" className="sr-only">
        {badge ? t('notifications.bell.unread', { count: count ?? 0 }) : ''}
      </UbBox>
      {open && <NotificationPanel open={open} onOpenChange={setOpen} returnFocusRef={triggerRef} />}
    </UbBox>
  );
}
