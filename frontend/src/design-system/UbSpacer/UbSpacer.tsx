'use client';

import { memo } from 'react';

import { MLBox } from 'src/design-system/primitives';
import { UB_HEIGHT, UB_WIDTH, type UbSpace } from 'src/design-system/scale';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — a deliberate, empty gap. Most spacing belongs to `UbStack`'s
 * `gap`; this exists for the cases where the space is structural rather than
 * between siblings — the strip that clears the 64 px bottom nav and the iOS
 * safe area (§19.6.3) is the one this codebase already had, written as a bare
 * `<div aria-hidden>`.
 *
 * Always `aria-hidden`: a spacer is furniture, and nothing should announce it.
 */
export type UbSpacerAxis = 'vertical' | 'horizontal';

export interface UbSpacerProps {
  readonly size: UbSpace;
  readonly axis?: UbSpacerAxis;
  readonly className?: string;
}

function UbSpacerBase({ size, axis = 'vertical', className }: Readonly<UbSpacerProps>) {
  return (
    <MLBox
      as="div"
      aria-hidden
      className={cn(axis === 'vertical' ? UB_HEIGHT[size] : UB_WIDTH[size], 'shrink-0', className)}
    />
  );
}

UbSpacerBase.displayName = 'UbSpacer';
export const UbSpacer = memo(UbSpacerBase);
