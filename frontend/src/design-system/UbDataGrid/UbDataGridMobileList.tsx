'use client';

import { memo, useCallback, type ReactNode } from 'react';

import { ChevronRight } from 'lucide-react';

import { UbAvatar } from 'src/design-system/UbAvatar';
import { cn } from 'src/utils/cn';

import { cardModel, fillTemplate, type UbCardModel } from './columnModel';

import type { UbDataGridColumn, UbDataGridLabels } from './types';

/**
 * The `< md` rendering, and the one the merchant actually uses.
 *
 * It is a REAL list — a `<ul>` of `<li>` — not a stack of divs, because a
 * screen reader announcing "list, 24 items" is the only thing on a phone that
 * tells the user how much is below the fold.
 *
 * The approved shape, and why each part of it is here:
 *
 *  · **60 px rows.** Two lines of text plus a figure, at the sizes Part 23
 *    §23.2.2 sets, and enough vertical room that a thumb travelling down the
 *    list does not clip the row above.
 *  · **A 44 px tap target (R-A-3).** The whole row is the target, and it is a
 *    real `<button>` — a row you open by tapping must appear in a screen
 *    reader's control list, or it is decoration.
 *  · **The initials disc** from `UbAvatar`, which gives the eye a fixed left
 *    edge to travel down. It is `aria-hidden`: the name is already the row's
 *    accessible name.
 *  · **The figure keeps its label.** The trailing column renders whatever the
 *    feature gave it, and the feature's contract (§23.2.6 rule 2) is that a
 *    toned amount cannot compile without one. Colour is never alone.
 *  · **Three facts.** Title, figure, and at most two supporting lines —
 *    `cardModel` enforces the cap rather than trusting the call site.
 */
export interface UbDataGridMobileListProps<TRow> {
  readonly rows: readonly TRow[];
  readonly columns: readonly UbDataGridColumn<TRow>[];
  readonly rowId: (row: TRow) => string;
  /** The plain-text name of the row, for the tap target's accessible name. */
  readonly rowName: (row: TRow) => string;
  readonly onRowOpen?: (row: TRow) => void;
  readonly labels: UbDataGridLabels;
  /** An accessible name for the list itself — "Customers". */
  readonly listLabel: string;
  /**
   * The initials disc on the left of each card. On by default, because most
   * lists in this product are lists of PEOPLE and a disc of initials is how a
   * merchant finds one at a glance.
   *
   * Off for a list of things. The tag manager is the case that asked for it: a
   * card reading "CA" beside "Camp Area" invites the reader to look for a
   * person, and the 40 px it costs is the difference between that row's three
   * actions sitting on one line and stacking on three.
   */
  readonly avatar?: boolean;
  readonly className?: string;
}

/** 60 px minimum, and the whole of it is the tap target (R-A-3). */
const CARD_BODY = 'flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left';

/**
 * A plain function rather than a nested component: it closes over the row's
 * generic parameter, and `react/no-unstable-nested-components` is right to
 * object to the alternative.
 */
const cardBody = <TRow,>(
  row: TRow,
  name: string,
  model: UbCardModel<TRow>,
  avatar: boolean
): ReactNode => (
  <>
    {avatar && <UbAvatar name={name} />}
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="ds-body-sm-medium truncate text-text-primary">
        {model.title ? model.title.cell(row) : name}
      </span>
      {model.meta.length > 0 && (
        <span className="ds-caption flex min-w-0 flex-wrap items-center gap-x-2 text-text-tertiary">
          {model.meta.map((column) => (
            <span key={column.id} className="truncate">
              {column.cell(row)}
            </span>
          ))}
        </span>
      )}
    </span>
    {model.trailing && <span className="shrink-0">{model.trailing.cell(row)}</span>}
  </>
);

function UbDataGridMobileListBase<TRow>({
  rows,
  columns,
  rowId,
  rowName,
  onRowOpen,
  labels,
  listLabel,
  avatar = true,
  className,
}: Readonly<UbDataGridMobileListProps<TRow>>): React.JSX.Element {
  const model = cardModel(columns);

  const handleOpen = useCallback(
    (row: TRow) => () => onRowOpen?.(row),
    [onRowOpen]
  );

  return (
    <ul
      aria-label={listLabel}
      data-testid="ub-grid-cards"
      data-ub-scroll-x="off"
      className={cn('w-full min-w-0 overflow-x-hidden', className)}
    >
      {rows.map((row) => {
        const name = rowName(row);
        const body = cardBody(row, name, model, avatar);

        return (
          <li
            key={rowId(row)}
            data-testid="ub-grid-card"
            className="border-b border-border-hairline last:border-b-0"
          >
            {onRowOpen ? (
              <button
                type="button"
                aria-label={fillTemplate(labels.openRow, { name })}
                onClick={handleOpen(row)}
                className={cn(
                  CARD_BODY,
                  'outline-none transition-colors duration-fast ease-standard',
                  'hover:bg-surface-hover focus-visible:shadow-focus active:bg-surface-active'
                )}
              >
                {body}
                <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" aria-hidden />
              </button>
            ) : (
              <div className={CARD_BODY}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

UbDataGridMobileListBase.displayName = 'UbDataGridMobileList';
export const UbDataGridMobileList = memo(
  UbDataGridMobileListBase
) as typeof UbDataGridMobileListBase;
