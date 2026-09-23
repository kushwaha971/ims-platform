'use client';

import { forwardRef, memo, useCallback, type InputHTMLAttributes, type ReactNode } from 'react';

import { MLInput } from 'src/design-system/primitives';
import { UbFilterChip, UbFilterChipGroup } from 'src/design-system/UbFilterChip';
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

interface UbDateInputOwnProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  /** ISO `YYYY-MM-DD`, or null for no date. */
  readonly value: string | null | undefined;
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

const UbDateInputInner = forwardRef<HTMLInputElement, UbDateInputProps>(function UbDateInputInner(
  { value, onChange, invalid, min, max, quickChoices, quickChoicesLabel, className, ...rest },
  ref
) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value || null),
    [onChange]
  );

  /* The pill, the 44px hit area and the pressed tint used to be written out
     here. They are `UbFilterChip` now, because PTY-02 needed the same control
     three more times and the hit area is exactly the part that goes missing in
     the third copy. `onToggle` ignores the next state: a date chip is a choice
     among dates, so pressing the applied one again re-applies it rather than
     clearing the field — that is `UbDateInput`'s own judgement and not the
     chip's. */
  const chips: ReactNode = quickChoices?.length ? (
    <UbFilterChipGroup label={quickChoicesLabel ?? ''} className="flex-wrap shrink">
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

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      <MLInput
        ref={ref}
        type="date"
        value={value ?? ''}
        onChange={handleChange}
        invalid={invalid}
        min={min}
        max={max}
        {...rest}
      />
      {chips}
    </div>
  );
});

UbDateInputInner.displayName = 'UbDateInput';
export const UbDateInput = memo(UbDateInputInner);
