'use client';

import { memo, type ReactNode } from 'react';

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
  /**
   * Drawn INSTEAD of the initials, for a row that has no name to take them
   * from. An invited team member has only an email address, and the disc read
   * "q" for "qa-invitee@…" — a lowercase letter that looks like a person's
   * initial and is not one (QA O3). A neutral icon says "not a person yet".
   */
  readonly icon?: ReactNode;
  readonly className?: string;
}

function UbAvatarBase({
  name,
  size = 'md',
  tone = 'default',
  icon,
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
      {icon ?? initialsOf(name)}
    </MLBox>
  );
}

UbAvatarBase.displayName = 'UbAvatar';
export const UbAvatar = memo(UbAvatarBase);
