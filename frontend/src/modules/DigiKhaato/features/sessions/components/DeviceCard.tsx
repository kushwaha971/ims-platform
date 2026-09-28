'use client';

import { memo, useCallback } from 'react';

import { LogOut, Monitor, Pencil, Smartphone, Tablet } from 'lucide-react';

import { UbBox, UbButton, UbCard, UbStack, UbStatusBadge, UbText } from 'src/design-system';

import type { DeviceKind, DeviceSession } from '../types/session.types';

const ICONS: Readonly<Record<DeviceKind, typeof Smartphone>> = {
  phone: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
};

export interface DeviceCardProps {
  readonly session: DeviceSession;
  readonly title: string;
  readonly caption: string;
  readonly labels: {
    readonly current: string;
    readonly rename: string;
    readonly logout: string;
    readonly currentHint: string;
  };
  readonly canWrite: boolean;
  readonly onRename: (id: string) => void;
  readonly onLogout: (id: string) => void;
}

/**
 * PLT-09 §7 — one device. The Log out button names the device in its
 * accessible label ("Log out Chrome on Android"), because a screen-reader user
 * tabbing through five identical "Log out" buttons cannot tell which one is
 * the stolen phone (§5).
 *
 * This device's Log out is disabled rather than hidden (§9 "Disabled"), with
 * the reason beside it: logging out HERE is the account menu's Sign out, and a
 * missing button reads as a product that cannot do it.
 */
function DeviceCardInner({
  session,
  title,
  caption,
  labels,
  canWrite,
  onRename,
  onLogout,
}: Readonly<DeviceCardProps>): React.JSX.Element {
  const Icon = ICONS[session.device ?? 'desktop'];
  const rename = useCallback(() => onRename(session.id), [onRename, session.id]);
  const logout = useCallback(() => onLogout(session.id), [onLogout, session.id]);

  return (
    <UbCard>
      <UbStack gap={3}>
        <UbStack direction="row" gap={3} align="start">
          <UbBox className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-text-secondary">
            <Icon aria-hidden className="h-5 w-5" />
          </UbBox>
          <UbStack gap={1} className="min-w-0 flex-1">
            <UbText variant="body-medium" className="line-clamp-2 break-words">
              {title}
            </UbText>
            {session.isCurrent && <UbStatusBadge label={labels.current} tone="success" />}
            <UbText variant="caption" tone="tertiary" className="break-words">
              {caption}
            </UbText>
          </UbStack>
        </UbStack>
        <UbStack direction="row" gap={2} wrap>
          <UbButton
            variant="ghost"
            size="sm"
            icon={<Pencil aria-hidden className="h-4 w-4" />}
            onClick={rename}
            disabled={!canWrite}
            aria-label={`${labels.rename} ${title}`}
          >
            {labels.rename}
          </UbButton>
          <UbButton
            variant="destructive"
            size="sm"
            icon={<LogOut aria-hidden className="h-4 w-4" />}
            onClick={logout}
            disabled={session.isCurrent || !canWrite}
            aria-label={`${labels.logout} ${title}`}
          >
            {labels.logout}
          </UbButton>
        </UbStack>
        {session.isCurrent && (
          <UbText variant="caption" tone="tertiary">
            {labels.currentHint}
          </UbText>
        )}
      </UbStack>
    </UbCard>
  );
}

export const DeviceCard = memo(DeviceCardInner);
