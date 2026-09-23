'use client';

import { memo } from 'react';

import { cn } from 'src/utils/cn';

import { UbTag, type UbTagColor } from './UbTag';

export interface UbTagListItem {
  readonly id: string;
  readonly name: string;
  readonly color: UbTagColor | null;
}

/**
 * A labelled list of tag chips, with a fixed lane height and an overflow count.
 *
 * ── The fixed lane is the whole point ───────────────────────────────────────
 * FRD PTY-05 §5. Chips arrive with the list response, so they are painted in
 * the same frame as the row and there is no "after" to shift from — but a row
 * with two tags and a row with none would be different HEIGHTS, and a list
 * where every third row is 4 px taller reads as broken even though nothing
 * moved. The lane is 24 px whether or not it holds anything, so a book with one
 * tagged party scrolls exactly like a book with none.
 *
 * ── The overflow is a count, not a scroll ───────────────────────────────────
 * A row is a place to decide, not a place to read. Past `max` the remainder
 * becomes "+3", which answers the only question a scanning merchant has about
 * the tags they cannot see — are there any — and the khata page answers the
 * rest. The `title` on the counter names them, so the answer is one hover away
 * without costing the row its width.
 *
 * ── `role="list"` is spelled out ────────────────────────────────────────────
 * R-A-1. Safari's VoiceOver drops list semantics from a `<ul>` whose
 * `list-style` is `none`, which every chip row necessarily is, so the role is
 * restated rather than inherited. `label` is required and not optional: an
 * unlabelled list of eight chips announces as "list, 8 items" beside a party
 * name and means nothing.
 */
export interface UbTagListProps {
  readonly tags: readonly UbTagListItem[];
  /** e.g. "Tags". Announced as the list's accessible name. */
  readonly label: string;
  /** Chips shown before the rest become a count. */
  readonly max?: number;
  /** `(count) => string`, e.g. `+3`. Translated by the caller. */
  readonly overflowLabel?: (count: number) => string;
  /** Reserve the lane even with no tags. The list does; the khata page does not. */
  readonly reserveSpace?: boolean;
  readonly className?: string;
}

function UbTagListBase({
  tags,
  label,
  max = 3,
  overflowLabel,
  reserveSpace = false,
  className,
}: Readonly<UbTagListProps>) {
  /* `max` of zero or less would be a lane that shows nothing and counts
     everything, which is never what a caller means. */
  const shown = tags.slice(0, Math.max(max, 1));
  const hidden = tags.slice(Math.max(max, 1));

  if (tags.length === 0 && !reserveSpace) return null;

  return (
    <ul
      role="list"
      aria-label={label}
      className={cn(
        'flex items-center gap-1 overflow-hidden',
        reserveSpace && 'min-h-6',
        className
      )}
    >
      {shown.map((tag) => (
        <UbTag key={tag.id} as="li" name={tag.name} color={tag.color} />
      ))}
      {hidden.length > 0 ? (
        <li
          /* Not a `UbTag`: it is not a tag. A chip that looks like the others
             but cannot be removed, filtered or clicked would be a lie told in
             the same visual language as the truth beside it. */
          title={hidden.map((tag) => tag.name).join(', ')}
          className="ds-label shrink-0 text-text-tertiary"
        >
          {overflowLabel ? overflowLabel(hidden.length) : `+${hidden.length}`}
        </li>
      ) : null}
    </ul>
  );
}

UbTagListBase.displayName = 'UbTagList';
export const UbTagList = memo(UbTagListBase);
