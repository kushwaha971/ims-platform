'use client';

import { memo } from 'react';

import { Check, Columns3 } from 'lucide-react';

import { UbButton } from 'src/design-system/UbButton';
import { UbPopover } from 'src/design-system/UbPopover';
import { cn } from 'src/utils/cn';

import { isHideable } from './columnModel';

import type { UbDataGridColumn, UbDataGridLabels } from './types';
import type { UbColumnVisibility } from './useColumnVisibility';

/**
 * BrandHub's column menu: a `Columns3` button on the right of the toolbar
 * opening a popover of tick-boxes, with **Show all** above a divider.
 *
 * ── What it is for, and what it is NOT for ──────────────────────────────────
 * It is not a second responsive system. `visibleColumns()` has already decided
 * what this WIDTH can carry, and this menu offers only what survived that
 * decision — so a merchant on a 900 px laptop is never handed a switch that
 * puts back a column the table has no room for and reintroduces the horizontal
 * scroll the whole grid exists to prevent.
 *
 * What it is for is the other half of the same problem: two people reading the
 * same list for different reasons. The shopkeeper chasing money wants Balance
 * and Last activity; the one doing GST wants GSTIN and nothing else. The
 * priority list cannot serve both, because it is one list.
 *
 * ── Why a column can be locked on ───────────────────────────────────────────
 * A priority-1 column is by definition the one this screen cannot be read
 * without — usually the name. The grid will not drop it for width, and the menu
 * will not drop it either: it appears, ticked and disabled, because a control
 * that is missing reads as a bug while one that is visibly locked reads as a
 * rule. `hideable` on the column overrides this when a screen knows better.
 */
export interface UbDataGridColumnMenuProps<TRow> {
  /** What the tier kept. Anything width already dropped is not offered. */
  readonly columns: readonly UbDataGridColumn<TRow>[];
  readonly visibility: UbColumnVisibility;
  readonly onColumnVisibleChange: (id: string, visible: boolean) => void;
  readonly onShowAll: () => void;
  readonly labels: UbDataGridLabels;
}

function UbDataGridColumnMenuBase<TRow>({
  columns,
  visibility,
  onColumnVisibleChange,
  onShowAll,
  labels,
}: Readonly<UbDataGridColumnMenuProps<TRow>>): React.JSX.Element {
  const shownCount = columns.filter((column) => visibility[column.id] !== false).length;

  return (
    <UbPopover
      side="bottom"
      align="end"
      sideOffset={4}
      label={labels.columns}
      className="max-h-[min(20rem,var(--radix-popover-content-available-height))]"
      trigger={
        <UbButton
          variant="outlineNeutral"
          size="sm"
          /* BrandHub's is `h-8`, and so is the filter standing next to it
             there. Ours is 44 because the filter standing next to it HERE is
             44 (R-A-3): two controls sharing a toolbar row match each other,
             and a 30 px button beside a 44 px select is the misalignment that
             reads as broken before anyone can say why. */
          className="h-11 shrink-0 whitespace-nowrap"
          /* The `icon` SLOT, not a child. `UbButton` wraps its children in a
             `<span>` for the busy-label swap, and Tailwind's preflight makes an
             `<svg>` `display: block` — so an icon passed as a child becomes a
             block inside an inline span and lands on its own line, with the
             label underneath it. Which is exactly what this button did. */
          icon={<Columns3 className="h-3.5 w-3.5" aria-hidden />}
          aria-haspopup="dialog"
          data-testid="ub-grid-column-menu-trigger"
        >
          {labels.columns}
        </UbButton>
      }
    >
      <div className="flex flex-col gap-0.5 p-2">
        <UbButton
          variant="ghost"
          size="sm"
          className="h-auto w-full justify-start px-2 py-1.5 text-text-tertiary"
          onClick={onShowAll}
        >
          {labels.showAllColumns}
        </UbButton>

        <div className="my-1 h-px shrink-0 bg-border-hairline" />

        {/* A listbox rather than a stack of buttons: a screen reader then
            announces "3 of 7 selected" and each row's own ticked state, which
            is the whole content of this panel. BrandHub puts `role="option"` on
            the rows without a `role="listbox"` around them, so the options are
            orphaned — a real defect, fixed here rather than copied. */}
        <div role="listbox" aria-multiselectable aria-label={labels.columns}>
          {columns.map((column) => {
            const visible = visibility[column.id] !== false;
            // The last visible column cannot be switched off. A table of zero
            // columns is not a view anyone asked for, and getting out of it
            // means finding a menu that is now a row of nothing.
            const locked = !isHideable(column) || (visible && shownCount <= 1);
            return (
              <UbButton
                key={column.id}
                variant="ghost"
                size="sm"
                role="option"
                aria-selected={visible}
                disabled={locked}
                onClick={locked ? undefined : () => onColumnVisibleChange(column.id, !visible)}
                className={cn(
                  'h-auto w-full shrink-0 justify-start px-2 py-1.5 text-text-primary',
                  locked && 'cursor-not-allowed opacity-60'
                )}
                icon={
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                      visible
                        ? 'border-accent bg-accent text-text-inverse'
                        : 'border-border-strong bg-surface-card'
                    )}
                  >
                    {visible && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                }
              >
                <span className="truncate">{column.header}</span>
              </UbButton>
            );
          })}
        </div>
      </div>
    </UbPopover>
  );
}

UbDataGridColumnMenuBase.displayName = 'UbDataGridColumnMenu';
export const UbDataGridColumnMenu = memo(
  UbDataGridColumnMenuBase
) as typeof UbDataGridColumnMenuBase;
