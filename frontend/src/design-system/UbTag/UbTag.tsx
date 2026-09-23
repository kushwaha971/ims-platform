'use client';

import { memo } from 'react';

import { X } from 'lucide-react';

import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — a TAG chip: a label a person put on a record.
 *
 * ── Why this is not `UbStatusBadge` ─────────────────────────────────────────
 * A status badge says something the SYSTEM knows — active, archived, overdue —
 * from a closed set the code enumerates, so its colour carries meaning that is
 * the same on every screen and in every tenant. A tag says something a MERCHANT
 * decided, from a set they invented this morning, and its colour means whatever
 * they wanted it to mean. Rendering the two the same way would teach a reader
 * that the amber chip is a warning when it is the word "Deccan".
 *
 * So: outline rather than filled, sentence case rather than the badge's caps,
 * and the colour on the border and the dot rather than on the whole pill.
 *
 * ── Colour is never the only signal ─────────────────────────────────────────
 * R-A-2. The name is always rendered, at full contrast, whatever the colour
 * token is — the swatch is recognition, not information. A merchant with
 * deuteranopia reads the same chip as everybody else, one beat slower.
 *
 * ── The colour is a TOKEN, not a hex value ──────────────────────────────────
 * `color` is one of the design system's eight `viz-*` roles, which is also what
 * the server stores. A hex value cannot answer the question this component is
 * asked on every render — which theme am I on — and `--viz-1` resolves through
 * `--primary-500`, which is redefined for dark mode. The map below is static
 * because Tailwind scans source text for class names and a computed
 * `border-viz-${n}` would be scanned, found absent, and dropped from the CSS.
 *
 * ── The 120 px ceiling ──────────────────────────────────────────────────────
 * FRD PTY-05 §7. A tag called "Camp Area East Sector 2" must not push the party
 * name off the row. It truncates, and `title` carries the whole thing for a
 * mouse; the accessible name is the full string either way, because a screen
 * reader is not short of horizontal space.
 */
export type UbTagColor = 'viz-1' | 'viz-2' | 'viz-3' | 'viz-4' | 'viz-5' | 'viz-6' | 'viz-7' | 'viz-8';

export const UB_TAG_COLORS: readonly UbTagColor[] = [
  'viz-1',
  'viz-2',
  'viz-3',
  'viz-4',
  'viz-5',
  'viz-6',
  'viz-7',
  'viz-8',
];

/** Static so Tailwind's scanner can see every class that can be emitted. */
const BORDER: Record<UbTagColor, string> = {
  'viz-1': 'border-viz-1',
  'viz-2': 'border-viz-2',
  'viz-3': 'border-viz-3',
  'viz-4': 'border-viz-4',
  'viz-5': 'border-viz-5',
  'viz-6': 'border-viz-6',
  'viz-7': 'border-viz-7',
  'viz-8': 'border-viz-8',
};

const DOT: Record<UbTagColor, string> = {
  'viz-1': 'bg-viz-1',
  'viz-2': 'bg-viz-2',
  'viz-3': 'bg-viz-3',
  'viz-4': 'bg-viz-4',
  'viz-5': 'bg-viz-5',
  'viz-6': 'bg-viz-6',
  'viz-7': 'bg-viz-7',
  'viz-8': 'bg-viz-8',
};

export const isUbTagColor = (value: string | null | undefined): value is UbTagColor =>
  value != null && (UB_TAG_COLORS as readonly string[]).includes(value);

export interface UbTagProps {
  /** User content. Never translated, never re-cased. */
  readonly name: string;
  /** A palette token, or null for a neutral chip. */
  readonly color?: UbTagColor | null;
  /**
   * When given, the chip carries a remove button. Its accessible name is
   * `removeLabel`, which the CALLER translates — this component takes no
   * dependency on react-intl so it can render inside a memoised grid cell.
   */
  readonly onRemove?: () => void;
  /** e.g. "Remove tag Camp Area". Required whenever `onRemove` is given. */
  readonly removeLabel?: string;
  /** `listitem` when the chip sits in a labelled list, which is the usual case. */
  readonly as?: 'span' | 'li';
  readonly className?: string;
}

function UbTagBase({
  name,
  color = null,
  onRemove,
  removeLabel,
  as = 'span',
  className,
}: Readonly<UbTagProps>) {
  const Element = as;
  return (
    <Element
      title={name}
      className={cn(
        /* `min-w-0` and no `shrink-0`, so two chips in a narrow lane SHARE it
           and each ends in an ellipsis. With `shrink-0` the second one was cut
           off mid-glyph at the card's edge on a 360 px phone — a chip reading
           "Decca" with no ellipsis, which looks like a rendering fault rather
           than a shortened label. The 120 px ceiling still applies at the top
           end so one long tag cannot push the party name off the row. */
        'inline-flex h-5 min-w-0 max-w-[120px] items-center gap-1 rounded-pill border px-1.5',
        'ds-label text-text-secondary',
        color ? BORDER[color] : 'border-border',
        className
      )}
    >
      {color ? (
        <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', DOT[color])} />
      ) : null}
      <span className="truncate">{name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={(event) => {
            /* The chip sits beside a popover trigger and, on a list row, inside
               a tappable row. Neither should fire because somebody took a tag
               off — a merchant removing "Camp Area" must not also open a picker
               over the form they are filling in, or navigate away from it. */
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          aria-label={removeLabel}
          /* The hit area is a 20 px chip's worth and no more, on purpose: this
             button sits INSIDE a row that is itself tappable, and a 44 px
             target here would swallow taps meant for the row. R-A-3's minimum
             is a floor for standalone controls; a destructive control nested in
             a larger one is the documented exception, and the same remove is
             always available from the form, where it is full size. */
          className={cn(
            '-mr-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full',
            'text-text-tertiary transition-colors duration-fast ease-standard',
            'hover:bg-surface-hover hover:text-text-primary',
            'outline-none focus-visible:shadow-focus motion-reduce:transition-none'
          )}
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      ) : null}
    </Element>
  );
}

UbTagBase.displayName = 'UbTag';
export const UbTag = memo(UbTagBase);
