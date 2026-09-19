'use client';

import { createElement, memo, type HTMLAttributes, type ReactNode } from 'react';

import { useBottomInset } from 'src/hooks/useBottomInset';
import { cn } from 'src/utils/cn';

/**
 * CR-2026-09-19-G — furniture at the bottom of the page, and the only thing
 * that has to know about it.
 *
 * A visual review found the global snackbar sitting on top of two screens'
 * bottom furniture at 360, 768 and 1280: the onboarding wizard's sticky
 * Continue bar, and the `(auth)` footer's legal links and language picker. The
 * toast's anchor assumed the bottom of the viewport was empty.
 *
 * Every component that puts something at the bottom of the page wraps it in
 * this one, and the toast clears it automatically — see `useBottomInset` for
 * why the measurement is published on `:root` rather than declared in CSS on
 * the bar itself, and `mlToastPrimitives` for the anchor that reads it. The
 * point of the indirection is that the NEXT screen with an action bar — the
 * entry-form editors, `UbBottomNav` on a phone — inherits the clearance
 * instead of rediscovering the defect and hard-coding a second number.
 *
 * It renders a host element, which is why it lives in `src/design-system/**`,
 * the one zone `react/forbid-elements` exempts.
 */
export type UbBottomBarElement = 'div' | 'footer' | 'nav';

export interface UbBottomBarProps extends HTMLAttributes<HTMLElement> {
  /** `footer` for the `(auth)` page footer — it is the `contentinfo` landmark. */
  readonly as?: UbBottomBarElement;
  /**
   * `false` for furniture that is at the END OF THE DOCUMENT rather than
   * pinned to the viewport — the auth footer at the bottom of a `min-h-dvh`
   * column. It still has to be cleared while it is on screen; it just should
   * not be given `position: sticky` it never had.
   */
  readonly sticky?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

function UbBottomBarBase({
  as = 'div',
  sticky = true,
  className,
  children,
  ...rest
}: Readonly<UbBottomBarProps>): React.JSX.Element {
  const ref = useBottomInset<HTMLElement>();

  return createElement(
    as,
    {
      ref,
      // Not read by any stylesheet: it is the marker that makes "what is at the
      // bottom of this page" greppable, and answerable in a DOM snapshot.
      'data-ub-bottom-bar': '',
      className: cn(sticky && 'sticky bottom-0 z-10', className),
      ...rest,
    },
    children
  );
}

UbBottomBarBase.displayName = 'UbBottomBar';
export const UbBottomBar = memo(UbBottomBarBase);
