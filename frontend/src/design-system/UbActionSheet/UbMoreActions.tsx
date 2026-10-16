'use client';

import { memo, useState, type Ref } from 'react';

import { MoreHorizontal } from 'lucide-react';

import { UbButton, type UbButtonSize } from 'src/design-system/UbButton';
import type { UbMenuListRow } from 'src/design-system/UbMenuList';

import { UbActionSheet } from './UbActionSheet';

/**
 * The ⋯ "More" button and the sheet of worded rows it opens — a record page's
 * occasional actions (edit, archive, block, statement), at every width.
 *
 * The khata, borrower and catalogue pages each built this by hand, with the
 * close-before-acting order written out three times (WP-03 D-04a). Rows come
 * as data; a row without `onSelect` or `href` is not drawn, and with none left
 * there is no button, because a ⋯ that opens an empty sheet is a control that
 * teaches a merchant the app is broken.
 *
 * "More" on screen, `title` ("More actions") to a screen reader: WCAG 2.5.3
 * asks that the accessible name contain the visible text, and "More" alone
 * says nothing about what it is more of.
 *
 * The sheet loads with the page, not on the press: a ⋯ that waits for a chunk
 * is worse than the bytes (PTY-03).
 */
export interface UbMoreActionsProps {
  /** The visible word on wider screens — "More". */
  readonly label: string;
  /** The button's accessible name and the sheet's title — "More actions". */
  readonly title: string;
  readonly closeLabel: string;
  readonly rows: readonly UbMenuListRow[];
  /**
   * The ⋯ button, for the page to hand to every dialog a row opens as its
   * `returnFocusRef`: the row is gone by the time that dialog closes, and
   * without a named fallback focus falls to <body> (WCAG 2.4.3).
   */
  readonly triggerRef?: Ref<HTMLButtonElement>;
  readonly size?: UbButtonSize;
  /** The trigger's classes, for an app's own phone sizing. */
  readonly className?: string;
  /** The sheet's classes, for an app's own overlay sizing. */
  readonly sheetClassName?: string;
  readonly testId?: string;
}

function UbMoreActionsBase({
  label,
  title,
  closeLabel,
  rows,
  triggerRef,
  size,
  className,
  sheetClassName,
  testId,
}: Readonly<UbMoreActionsProps>): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (!rows.some((row) => row.onSelect || row.href)) return null;
  return (
    <>
      <UbButton
        ref={triggerRef}
        variant="outlineNeutral"
        size={size}
        icon={<MoreHorizontal className="h-4 w-4" aria-hidden />}
        iconOnly="mobile"
        className={className}
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        {label}
      </UbButton>
      <UbActionSheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        closeLabel={closeLabel}
        rows={rows}
        className={sheetClassName}
      />
    </>
  );
}

UbMoreActionsBase.displayName = 'UbMoreActions';
export const UbMoreActions = memo(UbMoreActionsBase);
