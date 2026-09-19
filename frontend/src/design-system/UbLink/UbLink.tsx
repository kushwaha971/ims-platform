'use client';

import { memo, type AnchorHTMLAttributes, type ReactNode } from 'react';

import Link from 'next/link';

import {
  UB_TEXT_TONE,
  UB_TEXT_VARIANT,
  type UbTextTone,
  type UbTextVariant,
} from 'src/design-system/scale';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — an in-app link, typed from the same `ds-*` scale as
 * `UbText`. BrandHub's `BHHyperLink` fills this seat; here it wraps
 * `next/link`, so client-side navigation and prefetching are not something a
 * screen has to remember to keep.
 *
 * It is an anchor in the DOM, with an `href`, which is the whole point: a link
 * that is a `<button>` cannot be opened in a new tab, and a link that is a
 * `<div onClick>` cannot be reached by keyboard at all.
 */
export interface UbLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href' | 'className'
> {
  readonly href: string;
  readonly variant?: UbTextVariant;
  readonly tone?: UbTextTone;
  /** Underlined by default: colour alone never carries meaning (§23.2.4). */
  readonly underline?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
}

function UbLinkBase({
  href,
  variant = 'body-sm',
  tone = 'accent',
  underline = true,
  className,
  children,
  ...rest
}: Readonly<UbLinkProps>) {
  return (
    <Link
      href={href}
      className={cn(
        UB_TEXT_VARIANT[variant],
        UB_TEXT_TONE[tone],
        underline && 'underline',
        'rounded-xs outline-none focus-visible:shadow-focus',
        className
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}

UbLinkBase.displayName = 'UbLink';
export const UbLink = memo(UbLinkBase);
