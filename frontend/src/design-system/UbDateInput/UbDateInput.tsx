'use client';

import { forwardRef, memo, useCallback, useState, type ReactNode } from 'react';

import dynamic from 'next/dynamic';

import { Calendar } from 'lucide-react';

import { ML_CONTROL_TONE } from 'src/design-system/primitives/mlFormPrimitives';
import { UbFilterChip, UbFilterChipGroup } from 'src/design-system/UbFilterChip';
import { UbPopover } from 'src/design-system/UbPopover';
import { cn } from 'src/utils/cn';

/**
 * A date. Part 23 §23.3, deferred in Sprint 1 because nothing then took one.
 *
 * ── Why the native control, and not a calendar we draw ──────────────────────
 * The FRD sketches a text field plus a popover calendar, and this is a
 * deliberate departure. There is no calendar primitive in this kit, so drawing
 * one means a month grid, keyboard navigation across weeks, locale-aware first
 * day and week numbering, a focus trap and a positioning strategy — several
 * hundred lines whose failure modes are all in the keyboard and screen-reader
 * paths, and none of which this product has a designed spec for.
 *
 * `<input type="date">` gives all of that from the platform: a thumb-sized
 * wheel picker on Android and iOS, a real calendar on desktop, the OS date
 * format and the OS language, keyboard entry that already works, and a value
 * that is ISO `YYYY-MM-DD` by specification — which is exactly the wire format.
 * On the phone this product is built for, the native picker is not a
 * compromise; it is better than anything we would draw.
 *
 * ADR-021 also matters here: a calendar library is a dependency, and this one
 * would have to be argued for rather than assumed.
 *
 * ── Quick chips ────────────────────────────────────────────────────────────
 * The one thing the native control does not give is a shortcut. A collection
 * date is almost always "this Friday" and an opening balance is almost always
 * "the start of the financial year", and both are three taps through a picker.
 * The chips are ordinary buttons above the field and cost nothing when unused.
 */
export interface UbDateQuickChoice {
  readonly label: string;
  /** ISO `YYYY-MM-DD`. */
  readonly date: string;
}

/**
 * The quick choices and their group's name travel together, or neither does.
 *
 * A row of chips with no accessible name reads as three unrelated toggles, so
 * `UbFilterChipGroup` requires one — and a prop that is only required
 * SOMETIMES is the kind of thing a compiler can state and a comment cannot.
 * `quickChoicesLabel?: string` would have let a caller pass choices and no
 * name, and the consequence is invisible to everyone who is not using a screen
 * reader.
 */
type UbDateQuickChoices =
  | { readonly quickChoices?: undefined; readonly quickChoicesLabel?: never }
  | {
      readonly quickChoices: readonly UbDateQuickChoice[];
      /** Names the row — "Common dates", "Collection in". */
      readonly quickChoicesLabel: string;
    };

export type UbDateInputProps = UbDateInputOwnProps & UbDateQuickChoices;

interface UbDateInputOwnProps {
  /** ISO `YYYY-MM-DD`, or null for no date. */
  readonly value: string | null | undefined;
  readonly id?: string;
  readonly name?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly onBlur?: (...args: never[]) => void;
  readonly 'aria-label'?: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-required'?: boolean;
  /** How the chosen date is shown on the field; defaults to "23 Sep 2026". */
  readonly formatDate?: (iso: string) => string;
  readonly onChange: (value: string | null) => void;
  readonly invalid?: boolean;
  /** ISO bounds handed to the platform picker, which enforces them itself. */
  readonly min?: string;
  readonly max?: string;
  readonly className?: string;
}

/** Today as ISO, in the browser's own zone — a date is a calendar day, not an instant. */
export const isoToday = (now: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * The start of the Indian financial year containing `now` — 1 April.
 *
 * Every opening balance in this product is "what the book said when I started
 * keeping it", and for a merchant filing GST that date is almost always the
 * first of April. Before April, the year that started last April is the one
 * still open.
 */
export const isoFinancialYearStart = (now: Date = new Date()): string => {
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
};

const UbDateCalendarLazy = /* @__PURE__ */ dynamic(
  () => import('./UbDateCalendar').then((m) => m.UbDateCalendar),
  {
    ssr: false,
    loading: () => <div className="h-[296px] w-[252px]" aria-hidden />,
  }
);

/** `YYYY-MM-DD` ↔ a LOCAL midnight Date. Never `new Date(iso)`, which is UTC
 *  midnight and lands on the previous day west of Greenwich. */
const toDate = (iso: string | null | undefined): Date | undefined => {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
};
const toIso = (date: Date): string => isoToday(date);

const defaultFormat = (iso: string): string => {
  const date = toDate(iso);
  return date
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        date
      )
    : iso;
};

const UbDateInputInner = forwardRef<HTMLButtonElement, UbDateInputProps>(function UbDateInputInner(
  {
    value,
    onChange,
    invalid,
    min,
    max,
    quickChoices,
    quickChoicesLabel,
    className,
    placeholder,
    formatDate = defaultFormat,
    disabled,
    id,
    name,
    onBlur,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
  },
  ref
) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);

  const handleSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      onChange(toIso(date));
      setOpen(false);
    },
    [onChange]
  );

  const chips: ReactNode = quickChoices?.length ? (
    <UbFilterChipGroup label={quickChoicesLabel ?? ''} className="shrink flex-wrap">
      {quickChoices.map((choice) => (
        <UbFilterChip
          key={choice.date}
          label={choice.label}
          pressed={value === choice.date}
          onToggle={() => onChange(choice.date)}
        />
      ))}
    </UbFilterChipGroup>
  ) : null;

  /* BrandHub's date field (`ShipmentExpectedDelivery`): an outline-neutral
     button with a calendar icon and the date — or the placeholder, muted —
     that opens ml-uikit's calendar in a popover. It replaced the native
     `<input type="date">`, whose face follows the BROWSER's locale (04/01 on
     an en-US laptop, 01/04 on en-IN) and whose picker is the OS's, not ours. */
  const trigger = (
    <button
      ref={ref}
      type="button"
      id={id}
      name={name}
      disabled={disabled}
      onBlur={onBlur as React.FocusEventHandler<HTMLButtonElement> | undefined}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      aria-required={ariaRequired}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(
        'ds-body-base-regular flex h-10 w-full items-center gap-2 rounded-control border bg-surface-card px-3 text-left',
        'outline-none transition-colors duration-fast ease-standard',
        'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-muted',
        ML_CONTROL_TONE(invalid)
      )}
    >
      <Calendar aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
      <span className={cn('min-w-0 flex-1 truncate', !value && 'text-text-muted')}>
        {value ? formatDate(value) : (placeholder ?? '')}
      </span>
    </button>
  );

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      <UbPopover
        open={open}
        onOpenChange={setOpen}
        align="start"
        trigger={trigger}
        className="w-fit p-0"
        label={ariaLabel}
      >
        {open && (
          <UbDateCalendarLazy
            selected={selected}
            onSelect={handleSelect}
            min={toDate(min)}
            max={toDate(max)}
          />
        )}
      </UbPopover>
      {chips}
    </div>
  );
});

UbDateInputInner.displayName = 'UbDateInput';
export const UbDateInput = memo(UbDateInputInner);
