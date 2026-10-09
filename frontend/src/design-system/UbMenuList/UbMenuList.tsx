'use client';

import { memo, type ReactNode } from 'react';

import Link from 'next/link';

import { Check, ChevronRight } from 'lucide-react';

import { cn } from 'src/utils/cn';

/**
 * docs/mobile-redesign/04 §6.1 — a titled group of full-width rows, each a
 * destination or an action, in words.
 *
 * The phone's More tab is a stack of these (every destination the sidebar
 * has, minus the four tabs), and so are the labelled ⋯ sheets that replace the
 * rows of unlabelled icon buttons (audit finding A3). One component, so a row
 * looks and behaves the same wherever a merchant meets it: 56 px tall, 16 px
 * label, an optional caption, a chevron when it goes somewhere, a tick when it
 * is the current choice, and red only for a destructive action.
 *
 *  · A row with `href` is a link; a row with `onSelect` is a button. A row that
 *    is neither is plain text (who is signed in), never a dead control.
 *  · `selectable` groups are a radiogroup of `role="radio"` rows (language),
 *    so a screen reader hears the choice and which one is set.
 */
export interface UbMenuListRow {
  readonly key: string;
  readonly label: string;
  readonly caption?: string;
  /** `aria-hidden` icon, 20 px. */
  readonly icon?: ReactNode;
  readonly href?: string;
  readonly onSelect?: () => void;
  readonly tone?: 'default' | 'danger';
  /** For `selectable` groups: the current choice. */
  readonly selected?: boolean;
  /** The row's language, when its label is in another script (हिन्दी). */
  readonly lang?: string;
}

export interface UbMenuListProps {
  /** The group's heading; rows without one follow the previous group. */
  readonly title?: string;
  readonly rows: readonly UbMenuListRow[];
  /** A single choice among the rows (`radiogroup`). */
  readonly selectable?: boolean;
  readonly className?: string;
}

const ROW =
  'relative flex min-h-14 w-full items-center gap-4 px-4 py-2 text-left outline-none ' +
  'transition-colors duration-fast active:bg-surface-hover focus-visible:shadow-focus ' +
  'hover:bg-surface-hover';

function RowBody({ row, showChevron }: Readonly<{ row: UbMenuListRow; showChevron: boolean }>) {
  const danger = row.tone === 'danger';
  return (
    <>
      {row.icon ? (
        <span
          aria-hidden
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center',
            danger ? 'text-error' : 'text-text-secondary'
          )}
        >
          {row.icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          lang={row.lang}
          className={cn(
            'text-[16px] font-medium leading-[22px]',
            danger ? 'text-error' : 'text-text-primary'
          )}
        >
          {row.label}
        </span>
        {row.caption ? (
          <span className="text-[13px] leading-[18px] text-text-tertiary">{row.caption}</span>
        ) : null}
      </span>
      {row.selected ? <Check aria-hidden className="h-5 w-5 shrink-0 text-text-accent" /> : null}
      {showChevron ? (
        <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-tertiary" />
      ) : null}
    </>
  );
}

function UbMenuListBase({ title, rows, selectable = false, className }: Readonly<UbMenuListProps>) {
  const headingId = title ? `ub-menu-list-${title.replace(/\W+/g, '-').toLowerCase()}` : undefined;
  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col', className)}>
      {title ? (
        <h2
          id={headingId}
          className="px-4 pb-1 pt-5 text-[13px] font-semibold uppercase leading-[18px] tracking-[0.04em] text-text-tertiary"
        >
          {title}
        </h2>
      ) : null}
      <ul
        role={selectable ? 'radiogroup' : undefined}
        aria-labelledby={selectable ? headingId : undefined}
        className="flex flex-col"
      >
        {rows.map((row) => (
          <li key={row.key} className="flex">
            {row.href ? (
              <Link href={row.href} className={ROW}>
                <RowBody row={row} showChevron />
              </Link>
            ) : row.onSelect ? (
              <button
                type="button"
                onClick={row.onSelect}
                role={selectable ? 'radio' : undefined}
                aria-checked={selectable ? Boolean(row.selected) : undefined}
                className={ROW}
              >
                <RowBody row={row} showChevron={false} />
              </button>
            ) : (
              <span
                className={cn(ROW, 'cursor-default hover:bg-transparent active:bg-transparent')}
              >
                <RowBody row={row} showChevron={false} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

UbMenuListBase.displayName = 'UbMenuList';
export const UbMenuList = memo(UbMenuListBase);
