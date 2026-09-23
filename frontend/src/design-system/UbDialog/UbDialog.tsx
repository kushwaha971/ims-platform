'use client';

import { memo, useId, type ReactNode, type RefObject } from 'react';

import { X } from 'lucide-react';

import {
  MLDialog,
  MLDialogBody,
  MLDialogHeader,
  MLDialogDescription,
  MLDialogFooter,
  MLDialogTitle,
  MLIconButton,
} from 'src/design-system/primitives';

/**
 * Part 23 §23.3 — the modal. Desktop: a 480 px centred card. Mobile: a bottom
 * sheet, because a centred modal on a 360 px screen with the keyboard up is a
 * letterbox (PLT-15 §7 says exactly this).
 *
 * The wrapper owns three things the primitive does not:
 *  - the `aria-labelledby` / `aria-describedby` id pair, minted here so no
 *    caller can forget them and no two dialogs can collide;
 *  - the close affordance, with a translated accessible name; and
 *  - the footer slot, so every dialog in the product puts its actions in the
 *    same place, in the same order (cancel first in the DOM, primary last,
 *    reversed visually on mobile so the primary sits under the thumb).
 */
export interface UbDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  /** Accessible name of the close control; translated by the caller. */
  readonly closeLabel: string;
  /** Hidden for a decision the user must actually make. */
  readonly showClose?: boolean;
  readonly dismissOnBackdrop?: boolean;
  readonly icon?: ReactNode;
  readonly children?: ReactNode;
  readonly footer?: ReactNode;
  /**
   * Where focus returns on close if the element that opened this is no longer
   * in the document — e.g. an item in a menu sheet that closed as it opened
   * this one (QA D1, WCAG 2.4.3). Pass the control that opened the menu.
   */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly className?: string;
}

function UbDialogBase({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  showClose = true,
  dismissOnBackdrop = true,
  icon,
  children,
  footer,
  returnFocusRef,
  className,
}: Readonly<UbDialogProps>) {
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
      returnFocusRef={returnFocusRef}
      className={className}
    >
      <MLDialogHeader>
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <MLDialogTitle id={titleId}>{title}</MLDialogTitle>
          {description && (
            <MLDialogDescription id={descriptionId}>{description}</MLDialogDescription>
          )}
        </div>
        {showClose && (
          <MLIconButton aria-label={closeLabel} onClick={() => onOpenChange(false)} className="-mr-2">
            <X aria-hidden className="h-4 w-4" />
          </MLIconButton>
        )}
      </MLDialogHeader>
      {children && <MLDialogBody>{children}</MLDialogBody>}
      {footer && <MLDialogFooter>{footer}</MLDialogFooter>}
    </MLDialog>
  );
}

UbDialogBase.displayName = 'UbDialog';
export const UbDialog = memo(UbDialogBase);
