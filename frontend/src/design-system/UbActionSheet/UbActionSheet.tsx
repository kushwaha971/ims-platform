'use client';

import { memo, type ReactNode, type RefObject } from 'react';

import { UbDialog } from 'src/design-system/UbDialog';

import { UbActionPresentationContext } from './actionPresentation';

/**
 * docs/mobile-redesign/04 §6.1 — the ⋯ sheet: a page's secondary actions as
 * worded rows, from the bottom of a phone.
 *
 * It renders the SAME action elements the page header draws inline on a
 * desktop (`UbButton`, `UbActionLink`, and the feature components built on
 * them) under `UbActionPresentationContext = 'sheet'`, where they draw
 * themselves as full-width rows with their labels. So a screen writes its
 * actions once and gets both shapes — and a new action added to a header later
 * appears in the phone's sheet without anyone remembering to add it there.
 *
 * Choosing a row closes the sheet (after the row's own handler has run), as a
 * menu does; a row that opens a dialog of its own receives `returnFocusRef`
 * from its caller as usual.
 */
export interface UbActionSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

function UbActionSheetBase({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
  returnFocusRef,
}: Readonly<UbActionSheetProps>) {
  return (
    <UbDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      closeLabel={closeLabel}
      returnFocusRef={returnFocusRef}
    >
      <UbActionPresentationContext.Provider value="sheet">
        {/* The body is padded 24 px; the rows run edge to edge like a menu. */}
        <div
          role="group"
          aria-label={title}
          className="-mx-6 -my-3 flex flex-col"
          onClickCapture={(event) => {
            if ((event.target as HTMLElement).closest('a, button')) {
              // After the row's own handler: closing first would unmount it.
              window.setTimeout(() => onOpenChange(false), 0);
            }
          }}
        >
          {children}
        </div>
      </UbActionPresentationContext.Provider>
    </UbDialog>
  );
}

UbActionSheetBase.displayName = 'UbActionSheet';
export const UbActionSheet = memo(UbActionSheetBase);
