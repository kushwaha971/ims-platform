'use client';

import { memo } from 'react';

import { MLBox } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';
import { initialsOf } from 'src/utils/text';

/**
 * Part 23 §23.3 — the initials disc that fronts a party row, a tenant row and
 * the tenant-switcher trigger. BrandHub's `BHAvatar` fills the same seat.
 *
 * Before this wave the same seventeen classes were written out three times, and
 * the trigger's copy had already drifted to a different surface token. One
 * component, two sizes, two tones.
 *
 * It is `aria-hidden`, always: the initials are a redundant rendering of the
 * name that is already in the row's accessible name, and announcing "A M" in
 * front of "Amit Mehta" is noise, not information.
 */
export type UbAvatarSize = 'sm' | 'md';
export type UbAvatarTone = 'default' | 'onNav';

const SIZE: Readonly<Record<UbAvatarSize, string>> = {
  sm: 'h-7 w-7',
  md: 'h-10 w-10',
};

const TONE: Readonly<Record<UbAvatarTone, string>> = {
  default: 'bg-surface-sunken text-text-secondary',
  onNav: 'bg-surface-navHover text-text-onNav',
};

export interface UbAvatarProps {
  /** The full name; the initials are derived, never passed in pre-cut. */
  readonly name: string;
  readonly size?: UbAvatarSize;
  readonly tone?: UbAvatarTone;
  readonly className?: string;
}

function UbAvatarBase({
  name,
  size = 'md',
  tone = 'default',
  className,
}: Readonly<UbAvatarProps>) {
  return (
    <MLBox
      as="span"
      aria-hidden
      className={cn(
        'ds-label flex shrink-0 items-center justify-center rounded-pill',
        SIZE[size],
        TONE[tone],
        className
      )}
    >
      {initialsOf(name)}
    </MLBox>
  );
}

UbAvatarBase.displayName = 'UbAvatar';
export const UbAvatar = memo(UbAvatarBase);
