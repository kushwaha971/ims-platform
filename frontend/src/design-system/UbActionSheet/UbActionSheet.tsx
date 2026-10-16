'use client';

import { memo, useMemo, type ReactNode, type RefObject } from 'react';

import { UbDialog } from 'src/design-system/UbDialog';
import { UbMenuList, type UbMenuListRow } from 'src/design-system/UbMenuList';

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
 * Choosing a row closes the sheet in the same event as the row acts, as a
 * menu does. A row that opens a dialog while its sheet is still mounted leaves
 * two overlays, and Escape then closes the wrong one — the khata menu found
 * that, and five feature menus each re-solved it until they moved here (WP-03
 * D-04a). The close is a state update made after the row's handler, so its
 * dialog opens in the render that removes the sheet. A row
 * that opens a dialog receives `returnFocusRef` from its caller as usual.
 *
 * `rows` draws actions given as data (`UbMenuList` rows); `children` draws
 * header actions in their sheet presentation, or a note under the rows.
 */
export interface UbActionSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly closeLabel: string;
  readonly children?: ReactNode;
  /** Actions as data; a row without `onSelect` or `href` is not drawn. */
  readonly rows?: readonly UbMenuListRow[];
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  /** Passed to the dialog, for an app's own overlay sizing. */
  readonly className?: string;
}

function UbActionSheetBase({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
  rows,
  returnFocusRef,
  className,
}: Readonly<UbActionSheetProps>) {
  const shown = useMemo(
    () =>
      (rows ?? [])
        .filter((row) => row.onSelect || row.href)
        .map((row) =>
          row.onSelect
            ? {
                ...row,
                onSelect: () => {
                  onOpenChange(false);
                  row.onSelect?.();
                },
              }
            : row
        ),
    [rows, onOpenChange]
  );
  return (
    <UbDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      closeLabel={closeLabel}
      returnFocusRef={returnFocusRef}
      className={className}
    >
      <UbActionPresentationContext.Provider value="sheet">
        {/* The body is padded 24 px; the rows run edge to edge like a menu.
            The click listener only observes clicks on the buttons and links
            inside, which Enter and Space already produce; it needs no key
            handler of its own. */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
        <div
          role="group"
          aria-label={title}
          className="-mx-6 -my-3 flex flex-col"
          onClick={(event) => {
            /* The BUBBLE phase, after the row's own handler — never capture.
               React listens for capture and bubble with two native listeners
               on the root, and a real tap runs a microtask checkpoint between
               them: a close made in capture was flushed there, the sheet
               unmounted, and the row's onClick never ran. On a phone every
               header action in a ⋯ sheet closed the sheet and did nothing
               (the item page's Edit, Adjust stock and Archive, found by
               WP-07's look). jsdom and `element.click()` dispatch from script,
               where no checkpoint runs, so every unit test passed. Here the
               row has acted and the close lands in the same render as its
               dialog, as before. */
            const target = event.target as HTMLElement;
            if (target.closest('a, button') && !target.closest('[data-ub-sheet-rows]')) {
              onOpenChange(false);
            }
          }}
        >
          {shown.length > 0 ? (
            <div data-ub-sheet-rows="">
              <UbMenuList rows={shown} />
            </div>
          ) : null}
          {children}
        </div>
      </UbActionPresentationContext.Provider>
    </UbDialog>
  );
}

UbActionSheetBase.displayName = 'UbActionSheet';
export const UbActionSheet = memo(UbActionSheetBase);
