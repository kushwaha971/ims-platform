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
 * Choosing a row closes the sheet BEFORE the row acts, as a menu does. A row
 * that opens a dialog while its sheet is still mounted leaves two overlays,
 * and Escape then closes the wrong one — the khata menu found that, and five
 * feature menus each re-solved it until they moved here (WP-03 D-04a). The
 * close is a state update, so the row's own handler still runs in the same
 * event, and its dialog opens in the render that removes the sheet. A row
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
        {/* The body is padded 24 px; the rows run edge to edge like a menu. */}
        <div
          role="group"
          aria-label={title}
          className="-mx-6 -my-3 flex flex-col"
          onClickCapture={(event) => {
            // Capture runs before the row's own handler, which still runs: the
            // close is a state update and nothing unmounts mid-event.
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
