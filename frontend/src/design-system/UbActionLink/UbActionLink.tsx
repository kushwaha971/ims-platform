'use client';

import { memo, type AnchorHTMLAttributes, type ReactNode } from 'react';

import Link from 'next/link';

import {
  mlButtonClasses,
  type MLButtonSize,
  type MLButtonVariant,
} from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

import { ICON_ONLY_MOBILE, LABEL_ONLY_FROM_SM } from '../UbButton/UbButton';

/**
 * A link that looks like a button — for a header action that NAVIGATES or
 * DOWNLOADS: "Manage tags", "Export CSV". It was a text link beside real
 * buttons, so one header carried two visual languages for the same kind of
 * thing, and on a phone the text link wrapped to its own line.
 *
 * It is an anchor, not a button with an onClick, because a download and a
 * route change are what an anchor is for: middle-click, "copy link", and the
 * browser's own download handling all keep working.
 *
 * `iconOnly` follows `UbButton`'s: `true` always, `'mobile'` below `sm`. The
 * label is kept `sr-only`, so the accessible name is the visible word.
 */
export interface UbActionLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href' | 'children'
> {
  readonly href: string;
  readonly variant?: MLButtonVariant;
  readonly size?: MLButtonSize;
  readonly icon?: ReactNode;
  readonly iconOnly?: boolean | 'mobile';
  readonly children: ReactNode;
  readonly className?: string;
}

function UbActionLinkBase({
  href,
  variant = 'outlineNeutral',
  size = 'md',
  icon,
  iconOnly = false,
  children,
  className,
  ...rest
}: Readonly<UbActionLinkProps>) {
  const classes = mlButtonClasses(
    variant,
    size,
    cn(
      'outline-none focus-visible:shadow-focus',
      iconOnly === true && 'aspect-square px-0',
      iconOnly === 'mobile' && ICON_ONLY_MOBILE,
      className
    )
  );
  const label = (
    <span
      className={cn(
        'inline-flex items-center gap-2',
        iconOnly === true && 'sr-only',
        iconOnly === 'mobile' && LABEL_ONLY_FROM_SM
      )}
    >
      {children}
    </span>
  );
  /* A download goes to the API origin and must not be intercepted by the
     client router, so it is a plain anchor; so is anything that leaves the app
     — `https://wa.me/…`, `sms:`, `tel:` (NTF-03's deep links). A route is a
     `next/link`. */
  if (rest.download !== undefined || !href.startsWith('/')) {
    return (
      <a href={href} className={classes} {...rest}>
        {icon}
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {icon}
      {label}
    </Link>
  );
}

UbActionLinkBase.displayName = 'UbActionLink';
export const UbActionLink = memo(UbActionLinkBase);
