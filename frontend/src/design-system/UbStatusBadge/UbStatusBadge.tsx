'use client';

import { memo, type ReactNode } from 'react';

import { MLBadge } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.2.4 rule 3 — a status is a badge with a WORD in it, never a
 * coloured dot alone. The tone map is the only colour decision; the word comes
 * from the caller, already translated (a `Ub*` never reaches for `react-intl`).
 */
export type UbStatusBadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export interface UbStatusBadgeProps {
  /** The translated status word. Never a count — Koper: pills carry state. */
  readonly label: string;
  readonly tone?: UbStatusBadgeTone;
  readonly icon?: ReactNode;
  readonly className?: string;
}

function UbStatusBadgeBase({
  label,
  tone = 'neutral',
  icon,
  className,
}: Readonly<UbStatusBadgeProps>) {
  return (
    <MLBadge variant={tone} className={cn(className)}>
      {icon}
      {label}
    </MLBadge>
  );
}

UbStatusBadgeBase.displayName = 'UbStatusBadge';
export const UbStatusBadge = memo(UbStatusBadgeBase);
