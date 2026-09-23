'use client';

import { forwardRef, memo, useCallback, useState } from 'react';

import { Check, ChevronDown } from 'lucide-react';

import {
  MLCommand,
  MLCommandEmpty,
  MLCommandGroup,
  MLCommandInput,
  MLCommandItem,
  MLCommandList,
  MLPopover,
  MLPopoverContent,
  MLPopoverTrigger,
} from 'src/design-system/primitives';
import type { UbSelectOption } from 'src/design-system/UbSelect/UbSelect';
import { cn } from 'src/utils/cn';

/**
 * A single choice from a list long enough to need searching.
 *
 * `UbSelect` is the right control for a short closed list — five payment
 * methods, three statuses. It stops being right somewhere around fifteen
 * options, and the GST state picker has thirty-eight: scrolling a menu that
 * long to find "Maharashtra" is slower than typing "mah", and on a phone it is
 * considerably slower.
 *
 * Radix's Select has type-ahead but no visible search field, so what the user
 * typed is invisible and a mistyped letter silently jumps somewhere else. This
 * is `MLPopover` + `MLCommand` — the combination `ml-uikit` ships for exactly
 * this, and the same one BrandHub's `BrandHubCombobox` is built from.
 *
 * Props match `UbSelect` deliberately, so swapping one for the other as a list
 * grows is a one-word change and `UbField`'s props bag fits both.
 *
 * Focus and error follow the same rule as every other control here: no ring,
 * focus is a border-colour change, and the error colour survives focus. See
 * `UbSelect` for why, including the ml-uikit literal that has to be overridden
 * under its own variants rather than a plain class.
 */
export interface UbComboboxProps {
  readonly value: string | null | undefined;
  readonly onChange: (value: string) => void;
  readonly options: readonly UbSelectOption[];
  readonly placeholder?: string;
  /** Placeholder for the search field itself. */
  readonly searchPlaceholder?: string;
  /** Shown when nothing matches what was typed. */
  readonly emptyLabel?: string;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly name?: string;
  readonly id?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-required'?: boolean;
  readonly 'aria-describedby'?: string;
  readonly onBlur?: () => void;
}

const UbComboboxInner = forwardRef<HTMLButtonElement, UbComboboxProps>(function UbComboboxInner(
  {
    value,
    onChange,
    options,
    placeholder,
    searchPlaceholder,
    emptyLabel,
    invalid,
    disabled,
    className,
    id,
    onBlur,
    ...aria
  },
  ref
) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const handleSelect = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
    },
    [onChange]
  );

  /**
   * Escape closes THIS menu and stops there.
   *
   * Found on `UbTokenInput` first (see the long note there) and fixed here in
   * the same pass, because the exposure is identical the moment a combobox is
   * put inside an overlay — which PTY-05's merge dialog does. Radix portals the
   * popover out of the overlay's subtree, so the overlay's Escape handler and
   * this one are two listeners on the same document with no knowledge of each
   * other, and the overlay's was registered first.
   *
   * The GST state picker, this component's original caller, sits on a page
   * rather than in a dialog and was never affected — which is exactly why this
   * would have gone unnoticed until somebody lost a half-filled form.
   */
  const handleEscape = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    // Native too: React's synthetic `stopPropagation` does not stop a listener
    // attached directly to `document`, which is what the overlay's is.
    event.nativeEvent.stopImmediatePropagation();
    setOpen(false);
  }, []);

  return (
    <MLPopover open={open} onOpenChange={setOpen}>
      {/* Not `asChild`.
       *
       * The first version wrapped a hand-written <button> in
       * `<MLPopoverTrigger asChild>`, and the popover never opened: measured in
       * a browser, `aria-expanded` stayed `false` after a click and no popper
       * content was ever mounted. Radix's Slot clones the child to merge its
       * props, and an explicit `ref` and `aria-expanded` on that child fight
       * the ones Slot is trying to inject.
       *
       * Letting the trigger render its own button removes the whole
       * interaction. It already carries `role="combobox"`, `aria-expanded` and
       * `aria-controls` itself — correctly, and without anything to override
       * — so the styling is all that has to come from here. */}
      <MLPopoverTrigger
        ref={ref}
        id={id}
        // Radix's trigger defaults to a plain button with
        // `aria-haspopup="dialog"`. This is a combobox and assistive tech should
        // say so — and the role is load-bearing, not cosmetic: without it a test
        // or a screen reader looking for a combobox finds a button, which is how
        // a working component got reported as broken. `aria-expanded` and
        // `aria-controls` are Radix's own and are left to it.
        role="combobox"
        disabled={disabled}
        onBlur={onBlur}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-control border px-3',
          'ds-body bg-surface-card text-left text-text-primary',
          'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-muted',
          'focus-visible:outline-none focus-visible:ring-0',
          invalid
            ? 'aria-invalid:border-formError aria-invalid:focus-visible:border-formError border-formError focus-visible:border-formError'
            : 'border-border-hairline hover:border-border-subtle focus-visible:border-text-primary',
          className
        )}
        {...aria}
      >
        <span className={cn('truncate', !selected && 'text-text-muted')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
      </MLPopoverTrigger>

      <MLPopoverContent
        align="start"
        onKeyDownCapture={handleEscape}
        // Matched to the trigger so a long option cannot make the menu wider
        // than the field it belongs to — the same rule `UbSelect` follows.
        className="w-[var(--radix-popover-trigger-width)] border-border-subtle bg-surface-card p-0"
      >
        <MLCommand>
          <MLCommandInput placeholder={searchPlaceholder} className="ds-body-base-regular h-10" />
          <MLCommandList className="max-h-[min(18rem,55dvh)]">
            <MLCommandEmpty className="ds-body-sm px-3 py-6 text-center text-text-tertiary">
              {emptyLabel}
            </MLCommandEmpty>
            <MLCommandGroup>
              {options.map((option) => (
                <MLCommandItem
                  key={option.value}
                  value={option.label}
                  disabled={option.disabled}
                  onSelect={() => handleSelect(option.value)}
                  className="ds-body gap-2"
                >
                  <Check
                    aria-hidden
                    className={cn(
                      'h-4 w-4 shrink-0 text-accent',
                      option.value === value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </MLCommandItem>
              ))}
            </MLCommandGroup>
          </MLCommandList>
        </MLCommand>
      </MLPopoverContent>
    </MLPopover>
  );
});

UbComboboxInner.displayName = 'UbCombobox';
export const UbCombobox = memo(UbComboboxInner);
