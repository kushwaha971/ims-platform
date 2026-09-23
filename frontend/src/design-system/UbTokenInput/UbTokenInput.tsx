'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import { ChevronDown, Plus } from 'lucide-react';

import {
  MLCommand,
  MLCommandGroup,
  MLCommandInput,
  MLCommandItem,
  MLCommandList,
  MLPopover,
  MLPopoverContent,
  MLPopoverTrigger,
} from 'src/design-system/primitives';
import { UbTag, type UbTagColor } from 'src/design-system/UbTag';
import { cn } from 'src/utils/cn';

/**
 * Several choices from an open list, shown as chips, with create-inline.
 *
 * `UbCombobox` is one choice from a CLOSED list: thirty-eight GST states, and
 * the thirty-ninth does not exist. This is the other shape — a merchant's own
 * labels, where the set is whatever they have invented so far and the most
 * common interaction on a new install is adding one that is not there yet.
 * Trying to serve both from one component meant either a `multiple` flag that
 * changed half the behaviour or a combobox that could write to the server, and
 * both are worse than two components with one honest job each.
 *
 * ── Create-inline is not a fallback, it is the primary path ─────────────────
 * FRD PTY-05 §6: the flow that has to be two interactions is "type Camp, press
 * Create". A merchant at a counter with a customer in front of them will not
 * leave the party form to go and set up a taxonomy, and a picker that makes
 * them is a picker they stop using. So the Create row is offered as soon as the
 * query does not exactly match something, and it is SUPPRESSED on an exact
 * case-insensitive match — offering "Create 'camp area'" under an existing
 * "Camp Area" invites a duplicate the server would silently refuse anyway, and
 * the merchant would be left wondering which of the two they got.
 *
 * ── Backspace on an empty field removes the last chip ───────────────────────
 * The convention every token input has had since email To: fields, and the one
 * thing people try without being told. Only when the query is empty, so
 * correcting a typo never eats a chip.
 *
 * ── The trigger is the chips ────────────────────────────────────────────────
 * Not a field with chips beneath it: on a 360 px screen that is two rows for
 * one control. The chips ARE the button, they wrap, and the whole thing grows
 * downward as tags are added. `min-h-11` keeps R-A-3's target on an empty one.
 *
 * Removal happens on the chips OUTSIDE the popover — a merchant taking a tag
 * off should not have to open a menu to do it. This is why the remove button
 * lives here and stops propagation: a press on the X must not also open the
 * picker it sits inside.
 */
export interface UbTokenInputOption {
  /** The stable identity. For tags, the tag id. */
  readonly value: string;
  /** What the chip and the row show. User content; never re-cased. */
  readonly label: string;
  readonly color?: UbTagColor | null;
  /** Shown after the label in the picker, e.g. a usage count. */
  readonly hint?: string;
  readonly disabled?: boolean;
}

export interface UbTokenInputProps {
  /** Selected options, in the order the chips appear. */
  readonly value: readonly UbTokenInputOption[];
  readonly onChange: (next: readonly UbTokenInputOption[]) => void;
  /**
   * Everything selectable, already ORDERED by the caller — most-used first for
   * an empty query is FR-5's requirement and this component must not resort it.
   */
  readonly options: readonly UbTokenInputOption[];
  /**
   * Called when the merchant asks for a name that is not in `options`. The
   * caller decides what a new option's `value` is; returning `null` refuses it
   * (a name that failed validation, say).
   *
   * Omitted entirely when creation is not offered — a filter picker, or a user
   * without the right to create.
   */
  readonly onCreate?: (name: string) => UbTokenInputOption | null;
  /** Beyond this many chips the picker refuses more and says why. */
  readonly max?: number;
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  /** Shown when the query matches nothing AND creation is not on offer. */
  readonly emptyLabel?: string;
  /** `(name) => string`, e.g. `Create “Camp Area”`. */
  readonly createLabel?: (name: string) => string;
  /** `(max) => string`, shown in place of the list once `max` is reached. */
  readonly maxReachedLabel?: (max: number) => string;
  /** `(name) => string` for each chip's remove button. */
  readonly removeLabel?: (name: string) => string;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly id?: string;
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-required'?: boolean;
}

const fold = (text: string) => text.trim().toLocaleLowerCase();

function UbTokenInputBase({
  value,
  onChange,
  options,
  onCreate,
  max,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  createLabel,
  maxReachedLabel,
  removeLabel,
  disabled,
  invalid,
  id,
  className,
  ...aria
}: Readonly<UbTokenInputProps>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedValues = useMemo(
    () => new Set(value.map((option) => option.value)),
    [value]
  );
  const full = max != null && value.length >= max;

  const matches = useMemo(() => {
    const needle = fold(query);
    /* Prefix before substring, which is what FR-5 asks for and what a person
       typing expects: "ca" should put "Camp Area" above "Deccan Cash". Within
       each band the caller's order — most-used first — survives. */
    const unselected = options.filter((option) => !selectedValues.has(option.value));
    if (!needle) return unselected;
    const prefix = unselected.filter((option) => fold(option.label).startsWith(needle));
    const rest = unselected.filter(
      (option) => !fold(option.label).startsWith(needle) && fold(option.label).includes(needle)
    );
    return [...prefix, ...rest];
  }, [options, query, selectedValues]);

  /* Suppressed on an exact match against ANYTHING that exists, selected or
     not — a tag already on this party is still a reason not to offer to create
     it a second time. */
  const exists = useMemo(() => {
    const needle = fold(query);
    return needle.length > 0 && options.some((option) => fold(option.label) === needle);
  }, [options, query]);

  const canCreate = onCreate != null && query.trim().length > 0 && !exists && !full;

  const add = useCallback(
    (option: UbTokenInputOption) => {
      if (full || selectedValues.has(option.value)) return;
      onChange([...value, option]);
      setQuery('');
    },
    [full, onChange, selectedValues, value]
  );

  const remove = useCallback(
    (target: string) => {
      onChange(value.filter((option) => option.value !== target));
    },
    [onChange, value]
  );

  const create = useCallback(() => {
    if (onCreate == null) return;
    const made = onCreate(query.trim());
    if (made != null) add(made);
  }, [add, onCreate, query]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Backspace' || query.length > 0) return;
      const last = value[value.length - 1];
      if (last === undefined) return;
      // Only on an EMPTY query, so correcting a typo never eats a chip.
      event.preventDefault();
      remove(last.value);
    },
    [query, remove, value]
  );

  /**
   * Escape closes THIS picker and stops there.
   *
   * ── The defect, because it is not obvious from the code ────────────────────
   * This picker is used inside the party form's drawer and inside the bulk-tag
   * dialog. Radix portals the popover out of the overlay's DOM subtree, so the
   * overlay's Escape handler and the popover's are two independent listeners on
   * the same document — and the overlay's was registered first, so it ran
   * first. One press of Escape closed the picker AND the drawer, taking a
   * half-filled party form with it.
   *
   * Handled here, on the popover's own content, in the CAPTURE phase and with
   * `stopPropagation`, so the key never reaches the document at all. Capture
   * rather than bubble because the target may be the search input, an option or
   * the list, and every one of them bubbles to somewhere the document can see.
   *
   * `preventDefault` as well, so that any handler which does check
   * `defaultPrevented` — Radix's own layers do — agrees with the ones that do
   * not.
   */
  const handleEscape = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    // Native too: React's synthetic `stopPropagation` does not stop a listener
    // that was attached directly to `document`, which is exactly what the
    // overlay's is.
    event.nativeEvent.stopImmediatePropagation();
    setOpen(false);
  }, []);

  return (
    <MLPopover open={open} onOpenChange={setOpen}>
      {/* ── The field is a DIV; the chips and the trigger are siblings ────────
        *
        * The chips used to be rendered inside `MLPopoverTrigger`, which is a
        * real `<button>` — so every chip's remove button was a button inside a
        * button. Two things followed, and both were invisible in review:
        *
        *   1. Removing a tag also opened the picker, because the click bubbled
        *      to the trigger. The comment at the top of this file claimed the
        *      remove button stopped propagation. It did not.
        *   2. `<button>` inside `<button>` is invalid HTML. React's client
        *      render keeps the nesting; a SERVER render emits markup the parser
        *      auto-closes, so the chips hydrate somewhere React did not put
        *      them. Assistive technology is also not required to expose
        *      controls nested inside a `role="combobox"` button, which made a
        *      correctly labelled "Remove tag Camp Area" potentially
        *      unreachable.
        *
        * The wrapper carries the field's border and focus treatment via
        * `focus-within`, so it still LOOKS like one control — which it is. */}
      <div
        className={cn(
          'flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-control border px-2 py-1.5',
          'ds-body bg-surface-card text-left text-text-primary',
          disabled && 'cursor-not-allowed bg-surface-sunken text-text-muted',
          invalid
            ? 'border-formError'
            : 'border-border-strong hover:border-border-focus focus-within:border-border-focus',
          className
        )}
      >
        {value.map((option) => (
          <UbTag
            key={option.value}
            name={option.label}
            color={option.color ?? null}
            removeLabel={removeLabel?.(option.label)}
            onRemove={
              disabled
                ? undefined
                : () => {
                    remove(option.value);
                  }
            }
          />
        ))}
        <MLPopoverTrigger
          id={id}
          role="combobox"
          disabled={disabled}
          /* `flex-1` with a minimum, so the remaining strip of the field is the
             tap target however many chips are in front of it — and never
             narrower than a thumb once it is down to the chevron alone. */
          className={cn(
            'flex min-h-8 min-w-11 flex-1 items-center justify-between gap-2 rounded-control',
            'bg-transparent px-1 text-left',
            'disabled:cursor-not-allowed disabled:text-text-muted',
            'outline-none focus-visible:shadow-focus'
          )}
          {...aria}
        >
          {value.length === 0 ? (
            <span className="truncate text-text-muted">{placeholder}</span>
          ) : (
            <span className="sr-only">{placeholder}</span>
          )}
          <ChevronDown aria-hidden className="ml-auto size-4 shrink-0 text-text-tertiary" />
        </MLPopoverTrigger>
      </div>

      <MLPopoverContent
        align="start"
        onKeyDownCapture={handleEscape}
        className="w-[var(--radix-popover-trigger-width)] border-border-subtle bg-surface-card p-0"
      >
        {/* Our own filtering, not cmdk's: `shouldFilter` sorts by its internal
            match score, which would throw away the most-used-first ordering
            FR-5 specifies for an empty query. */}
        <MLCommand shouldFilter={false}>
          <MLCommandInput
            value={query}
            onValueChange={setQuery}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="ds-body h-11"
          />
          <MLCommandList className="max-h-[min(18rem,55dvh)]">
            {full ? (
              <UbTokenInputNotice text={maxReachedLabel?.(max) ?? ''} />
            ) : (
              <>
                {matches.length === 0 && !canCreate ? (
                  <UbTokenInputNotice text={emptyLabel ?? ''} />
                ) : null}
                <MLCommandGroup>
                  {matches.map((option) => (
                    <MLCommandItem
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      onSelect={() => {
                        add(option);
                      }}
                      className="ds-body gap-2"
                    >
                      <UbTag name={option.label} color={option.color ?? null} />
                      {option.hint ? (
                        <span className="ml-auto ds-label text-text-tertiary">{option.hint}</span>
                      ) : null}
                    </MLCommandItem>
                  ))}
                  {canCreate ? (
                    <MLCommandItem
                      value={`__create__${query}`}
                      onSelect={create}
                      className="ds-body gap-2 text-text-accent"
                    >
                      <Plus aria-hidden className="size-4 shrink-0" />
                      <span className="truncate">{createLabel?.(query.trim()) ?? query.trim()}</span>
                    </MLCommandItem>
                  ) : null}
                </MLCommandGroup>
              </>
            )}
          </MLCommandList>
        </MLCommand>
      </MLPopoverContent>
    </MLPopover>
  );
}

/** cmdk's own `CommandEmpty` only renders when ITS filter found nothing, and
 *  filtering is off here — so the notice is plain markup. */
function UbTokenInputNotice({ text }: Readonly<{ text: string }>) {
  return <div className="ds-body-sm px-3 py-6 text-center text-text-tertiary">{text}</div>;
}

UbTokenInputBase.displayName = 'UbTokenInput';
export const UbTokenInput = memo(UbTokenInputBase);
