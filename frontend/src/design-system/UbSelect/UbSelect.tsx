'use client';

import { forwardRef, memo } from 'react';

import {
  MLSelect,
  MLSelectContent,
  MLSelectItem,
  MLSelectTrigger,
  MLSelectValue,
} from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — a single choice from a known, closed list. PLT-03's 38 GST
 * state codes are the Sprint 1 caller.
 *
 * This was a native `<select>` until `ml-uikit` was vendored, because the real
 * package was unreachable and the stand-in refused to fake a combobox. Two of
 * the reported UI defects came straight out of that: the platform's own chevron
 * (the stand-in reserved 32px of right padding for an icon it never drew, since
 * `ML_CONTROL_BASE` carried no `appearance-none`), and a menu that could not be
 * positioned, sized or keyboard-navigated to the design.
 *
 * **The props are unchanged on purpose.** `value`, `onChange(value)`, `options`,
 * `placeholder`, `invalid`, `className` — so every call site, and `UbField`'s
 * props bag, work exactly as before. Only the inside changed.
 *
 * ## Focus and error, copied from BrandHub rather than invented
 *
 * BrandHub's portal never puts a focus RING on a form control; focus is a
 * border-colour change, and the triplet
 * `focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-0`
 * appears in five independent places there. That is what this uses.
 *
 * It is also the fix for the double outline in the screenshot: a global
 * `:focus-visible { box-shadow: var(--focus-ring) }` in `app/globals.css` painted
 * an indigo ring on every focusable element, while `ML_CONTROL_TONE` painted a
 * crimson error border with no focus-awareness, so a focused invalid field drew
 * both — 1px crimson, a 2px card-coloured spacer, then a 2px indigo ring.
 *
 * And `invalid` keeps the error colour *through* focus
 * (`focus-visible:border-formError`). BrandHub gets this wrong on most of its
 * own wrappers — `focus-visible:border-foreground` is listed before the
 * conditional `border-destructive` but they are different variants, so twMerge
 * cannot collapse them and the focused field turns dark, losing the error colour
 * until blur. Only `BrandHubWebsiteInput` handles it. This follows that one.
 */
export interface UbSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface UbSelectProps {
  readonly value: string | null | undefined;
  readonly onChange: (value: string) => void;
  readonly options: readonly UbSelectOption[];
  readonly placeholder?: string;
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

const UbSelectInner = forwardRef<HTMLButtonElement, UbSelectProps>(function UbSelectInner(
  { value, onChange, options, placeholder, invalid, disabled, className, name, id, onBlur, ...aria },
  ref
) {
  return (
    <MLSelect
      value={value ?? undefined}
      onValueChange={onChange}
      disabled={disabled}
      name={name}
    >
      <MLSelectTrigger
        ref={ref}
        id={id}
        onBlur={onBlur}
        className={cn(
          // 44px, not shadcn's 40 — R-A-3's touch target, which the product's
          // own controls all meet and ml-uikit's default does not.
          'h-11 w-full rounded-control bg-surface-card text-text-primary',
          'focus-visible:outline-none focus-visible:ring-0',
          // `aria-invalid:` is not decoration — ml-uikit's own trigger carries
          // `aria-invalid:border-[#ff3b30]` and `aria-invalid:focus-visible:border-[#ff3b30]`
          // as literal hex. twMerge cannot collapse those against a plain
          // `border-formError`, because a variant class and a base class are
          // different keys, so the library's pink would win the moment
          // `aria-invalid` is set — which is precisely the pink in the reported
          // screenshot. Restating the token under the same variants is what
          // actually overrides it.
          invalid
            ? 'border-formError focus-visible:border-formError aria-invalid:border-formError aria-invalid:focus-visible:border-formError'
            : 'border-border-strong focus-visible:border-border-focus',
          className
        )}
        {...aria}
      >
        <MLSelectValue placeholder={placeholder} />
      </MLSelectTrigger>

      <MLSelectContent
        // Matches the trigger's width so a long option cannot make the menu
        // wider than the field it belongs to, and caps the height so 38 GST
        // states scroll rather than running off a short viewport.
        className="max-h-[min(20rem,60dvh)] w-[var(--radix-select-trigger-width)] bg-surface-card"
      >
        {options.map((option) => (
          <MLSelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </MLSelectItem>
        ))}
      </MLSelectContent>
    </MLSelect>
  );
});

UbSelectInner.displayName = 'UbSelect';
export const UbSelect = memo(UbSelectInner);
