'use client';

import { memo, type ReactNode } from 'react';

import { MLBox } from 'src/design-system/primitives';
import {
  UB_TEXT_TONE,
  UB_TEXT_VARIANT,
  type UbTextTone,
  type UbTextVariant,
} from 'src/design-system/scale';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — the two-line body of a list row: a title that truncates and
 * an optional second line under it. BrandHub's `BHListItemText` fills exactly
 * this seat (MUI's `ListItemText` with its `primary`/`secondary` pair), and the
 * prop names here are deliberately the same ones.
 *
 * It existed three times in this codebase as raw markup — the party row, the
 * tenant chooser row and the tenant-switcher menu item — and the three copies
 * had already diverged on the secondary line's tone (`text-text-muted` in one,
 * `text-text-tertiary` in the other two).
 *
 * Everything it renders is a `<span>`, not a `<p>`: two of the three call sites
 * are inside a `<button>`, where a `<p>` is invalid HTML and browsers will
 * silently close the button around it.
 */
export interface UbListItemTextProps {
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
  readonly primaryVariant?: UbTextVariant;
  readonly primaryTone?: UbTextTone;
  readonly secondaryVariant?: UbTextVariant;
  readonly secondaryTone?: UbTextTone;
  /** Native tooltip for a title the row had to cut short. */
  readonly title?: string;
  readonly className?: string;
}

function UbListItemTextBase({
  primary,
  secondary,
  primaryVariant = 'body-sm-medium',
  primaryTone = 'primary',
  secondaryVariant = 'caption',
  secondaryTone = 'tertiary',
  title,
  className,
}: Readonly<UbListItemTextProps>) {
  return (
    <MLBox as="span" className={cn('flex min-w-0 flex-1 flex-col', className)}>
      <MLBox
        as="span"
        title={title}
        className={cn('truncate', UB_TEXT_VARIANT[primaryVariant], UB_TEXT_TONE[primaryTone])}
      >
        {primary}
      </MLBox>
      {secondary !== undefined && secondary !== null && secondary !== false && (
        <MLBox
          as="span"
          className={cn(UB_TEXT_VARIANT[secondaryVariant], UB_TEXT_TONE[secondaryTone])}
        >
          {secondary}
        </MLBox>
      )}
    </MLBox>
  );
}

UbListItemTextBase.displayName = 'UbListItemText';
export const UbListItemText = memo(UbListItemTextBase);
