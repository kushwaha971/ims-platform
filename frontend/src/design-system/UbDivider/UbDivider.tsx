'use client';

import { memo } from 'react';

import { MLBox, MLSeparator } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — "hairlines over boxes" is one of the Koper rules this product
 * kept, so the hairline is a component rather than a `border-t` a screen
 * remembers to add. BrandHub's `BHDivider` fills the same seat.
 *
 * Horizontal renders an `<hr>`, which is already an implicit `separator` to
 * assistive technology. Vertical cannot be an `<hr>` in a flex row without
 * fighting its own default margins, so it is an explicit `role="separator"`
 * with `aria-orientation`, which is what a screen reader needs to announce it
 * the same way.
 */
export type UbDividerOrientation = 'horizontal' | 'vertical';

export interface UbDividerProps {
  readonly orientation?: UbDividerOrientation;
  /** A purely visual rule, hidden from assistive technology. */
  readonly decorative?: boolean;
  readonly className?: string;
}

function UbDividerBase({
  orientation = 'horizontal',
  decorative = false,
  className,
}: Readonly<UbDividerProps>) {
  if (orientation === 'vertical') {
    return (
      <MLBox
        as="div"
        role={decorative ? undefined : 'separator'}
        aria-orientation={decorative ? undefined : 'vertical'}
        aria-hidden={decorative ? true : undefined}
        className={cn('w-px self-stretch bg-border-hairline', className)}
      />
    );
  }

  return (
    <MLSeparator
      aria-hidden={decorative ? true : undefined}
      className={cn('w-full', className)}
    />
  );
}

UbDividerBase.displayName = 'UbDivider';
export const UbDivider = memo(UbDividerBase);
