'use client';

import { memo, useId, type ReactNode } from 'react';

import { X } from 'lucide-react';

import {
  MLDialog,
  MLDialogBody,
  MLDialogDescription,
  MLDialogFooter,
  MLDialogHeader,
  MLDialogTitle,
  MLIconButton,
} from 'src/design-system/primitives';

/**
 * The long form. Part 23 §23.3, and the component Sprint 1 deferred because no
 * screen then took more than four fields.
 *
 * ── Why not `UbDialog` ──────────────────────────────────────────────────────
 * A party form is twenty-odd fields in six groups. In a 420 px centred card
 * that is a letterbox with a scrollbar, and the list the merchant was working
 * from disappears behind it — which matters, because adding a party is almost
 * always something done in the middle of another job. The drawer keeps the
 * list on screen at desktop width and keeps the sheet thumb-reachable on a
 * phone.
 *
 * ── Why it is the same primitive ────────────────────────────────────────────
 * `MLDialog` with `placement="drawer"`. The portal, the focus trap, the body
 * scroll lock and restoring focus to whatever opened it are identical between
 * a modal and a drawer, and they are exactly the parts that go subtly wrong
 * when they are implemented twice. What differs is where the panel sits, which
 * is a class name, so that is all this adds.
 *
 * ── The footer is sticky ────────────────────────────────────────────────────
 * `MLDialogFooter` sits outside the scrolling body, so Save is on screen at
 * every scroll position. In a form this long, a Save button that has to be
 * scrolled to is a form people abandon halfway.
 */
export interface UbDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  /** Accessible name of the close control; translated by the caller. */
  readonly closeLabel: string;
  /**
   * False while a form is dirty: the caller intercepts the close and asks
   * first. A backdrop tap is the easiest way to lose ten minutes of typing.
   */
  readonly dismissOnBackdrop?: boolean;
  readonly children?: ReactNode;
  /** The action row. Cancel first in the DOM, primary last. */
  readonly footer?: ReactNode;
  readonly className?: string;
}

function UbDrawerBase({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  dismissOnBackdrop = true,
  children,
  footer,
  className,
}: Readonly<UbDrawerProps>) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return (
    <MLDialog
      open={open}
      onOpenChange={onOpenChange}
      labelledBy={titleId}
      describedBy={description ? descriptionId : undefined}
      dismissOnBackdrop={dismissOnBackdrop}
      placement="drawer"
      className={className}
    >
      <MLDialogHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <MLDialogTitle id={titleId}>{title}</MLDialogTitle>
          {description && (
            <MLDialogDescription id={descriptionId}>{description}</MLDialogDescription>
          )}
        </div>
        <MLIconButton aria-label={closeLabel} onClick={() => onOpenChange(false)} className="-mr-2">
          <X aria-hidden className="h-4 w-4" />
        </MLIconButton>
      </MLDialogHeader>
      {children && <MLDialogBody>{children}</MLDialogBody>}
      {footer && <MLDialogFooter>{footer}</MLDialogFooter>}
    </MLDialog>
  );
}

UbDrawerBase.displayName = 'UbDrawer';
export const UbDrawer = memo(UbDrawerBase);
