'use client';

import { memo, type ReactNode } from 'react';

import { UbBox } from 'src/design-system';
import { cn } from 'src/utils/cn';

/**
 * CR-2026-09-19-D — the surface a form sits on inside `AuthShell`.
 *
 * It is a card from `sm` up and NOTHING below it. On a 360 px phone a card
 * costs 16 px of page gutter plus 20 px of card padding on each side — 72 px of
 * a 360 px screen, 20 % of the width — to draw a box around a form that already
 * fills the viewport and has nothing beside it to be distinguished from. Stripe
 * and Zoho both drop it at that width for the same arithmetic. From `sm` up the
 * column no longer fills the screen, so it needs its own edge, and the card
 * appears.
 *
 * That edge is the reason the dark re-tone matters (CR-2026-09-19-D, dark.css):
 * `--surface-card` on `--canvas` was 1.12:1 and `--border-hairline` on the
 * canvas was 1.27:1, so above `sm` the card had neither a fill step nor a
 * visible boundary. It is 1.25:1 and 1.57:1 now — the box is a box.
 */
export interface AuthPanelProps {
  readonly children: ReactNode;
  readonly className?: string;
}

function AuthPanelBase({ children, className }: Readonly<AuthPanelProps>) {
  return (
    <UbBox
      className={cn(
        // Figma: the form sits on the page, not in a card.
        'w-full',
        className
      )}
    >
      {children}
    </UbBox>
  );
}

AuthPanelBase.displayName = 'AuthPanel';
export const AuthPanel = memo(AuthPanelBase);
