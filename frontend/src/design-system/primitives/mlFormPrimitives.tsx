'use client';

/* =============================================================================
 * ⚠️  STAND-IN FOR `ml-uikit` — see ./index.ts for the swap instructions.
 * =============================================================================
 *
 * Design-system wave 1 (Part 32 §32.4.4) needs form primitives that Sprint 0's
 * wave did not: text entry, a checkbox, a radio group, a native select, a
 * progress bar, an icon button, tabs and a toggle group. The real `ml-uikit`
 * builds all of these on Radix; these stand-ins carry the same semantics —
 * element, role, ARIA wiring, keyboard behaviour and token-backed classes — and
 * nothing else.
 *
 * They must never grow product behaviour: `+91`, six OTP cells, password
 * strength and the `--form-error` message tier all live in the `Ub*` wrappers
 * above them (§19.8.5).
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from 'src/utils/cn';

// ── Text entry ───────────────────────────────────────────────────────────────

export interface MLInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Paints the `--form-error` border; the MESSAGE is `UbFieldError`'s job. */
  readonly invalid?: boolean;
  readonly className?: string;
}

/**
 * 44px tall at every size: R-A-3's touch-target floor is not a mobile-only
 * rule, because the same markup renders on both breakpoints.
 *
 * **This is the one measurement deliberately NOT taken from BrandHub.** Its
 * customer controls are `h-10` (40px), and that is fine for a portal people
 * open on a laptop. This product is used one-handed, on a cheap Android, by a
 * shopkeeper with a customer waiting — 44px is the touch-target floor and the
 * four pixels are not decoration. Everything else on this line follows
 * BrandHub.
 *
 * **Disabled is FILLED, not faded** — `disabled:opacity-100` with a solid
 * `surface-sunken`, which is BrandHub's `disabled:bg-[#f2f2f2] …
 * disabled:opacity-100`. It used to be `opacity-60`, and a 60%-opacity field is
 * unreadable on a phone held at arm's length in daylight, which is the normal
 * reading condition for this product. A disabled control should look
 * unavailable, not look broken.
 */
export const ML_CONTROL_BASE =
  'h-10 w-full rounded-control border bg-surface-card px-3 ds-body-base-regular text-text-primary ' +
  'placeholder:text-text-muted transition-colors duration-fast ease-standard ' +
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-muted ' +
  'disabled:opacity-100 read-only:bg-surface-sunken';

/**
 * Border colour by state — and the other half of the double-outline fix.
 *
 * Focus is expressed here, as a border colour, because `app/globals.css` no
 * longer paints a ring on form controls. That is BrandHub's rule copied
 * verbatim: its portal never rings an input, and
 * `focus-visible:border-foreground focus-visible:outline-none
 * focus-visible:ring-0` appears in five independent places there.
 *
 * `invalid` keeps the error colour THROUGH focus. BrandHub gets this wrong on
 * most of its own wrappers — `focus-visible:border-foreground` sits before the
 * conditional `border-destructive` in the `cn()` call, and because they are
 * different variants twMerge cannot collapse them, so a focused invalid field
 * turns dark and loses the error colour until blur. Only `BrandHubWebsiteInput`
 * handles it, with `invalid && 'border-destructive focus-within:border-destructive'`.
 * ml-uikit's own inputs do the same thing with
 * `aria-invalid:focus-visible:border-[#ff3b30]`. This follows those two, not the
 * majority.
 */
export const ML_CONTROL_TONE = (invalid?: boolean): string =>
  invalid
    ? 'border-formError focus-visible:border-formError'
    : // BrandHub: a #E6E6E6 hairline at rest, the ink colour on focus.
      'border-border-hairline hover:border-border-subtle focus-visible:border-text-primary';

export const MLInput = forwardRef<HTMLInputElement, MLInputProps>(function MLInput(
  { invalid, className, type = 'text', ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(ML_CONTROL_BASE, ML_CONTROL_TONE(invalid), className)}
      {...rest}
    />
  );
});

export interface MLTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly invalid?: boolean;
  readonly className?: string;
}

export const MLTextarea = forwardRef<HTMLTextAreaElement, MLTextareaProps>(function MLTextarea(
  { invalid, className, rows = 3, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        ML_CONTROL_BASE,
        ML_CONTROL_TONE(invalid),
        'h-auto min-h-[120px] py-2',
        className
      )}
      {...rest}
    />
  );
});

export interface MLSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly invalid?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

/**
 * A NATIVE `<select>`. The real ml-uikit ships a Radix combobox; the stand-in
 * deliberately does not fake one, and a native select is the better stand-in
 * than a div with `role="combobox"`: it is keyboard-operable, type-ahead
 * searchable and renders as the platform picker on a 2 GB Android phone, which
 * is what PLT-03's 38-row state list actually needs.
 */
/**
 * The native select's chevron and padding. The rule itself is
 * `.ub-native-select` in `app/globals.css`, because a data-URI background does
 * not survive Tailwind's arbitrary-value parser — the URI's own commas end the
 * class, and the utility compiles to nothing. See that rule for the rest.
 */
export const ML_NATIVE_SELECT_CHEVRON = 'ub-native-select pr-9';

export const MLSelect = forwardRef<HTMLSelectElement, MLSelectProps>(function MLSelect(
  { invalid, className, children, ...rest },
  ref
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(ML_CONTROL_BASE, ML_CONTROL_TONE(invalid), ML_NATIVE_SELECT_CHEVRON, className)}
      {...rest}
    >
      {children}
    </select>
  );
});

// ── Choice controls ──────────────────────────────────────────────────────────

export interface MLToggleOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
}

export interface MLToggleGroupProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly MLToggleOption<T>[];
  readonly ariaLabel: string;
  readonly className?: string;
}

/** A segmented control. `aria-pressed` rather than tabs: it changes a value. */
export function MLToggleGroup<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}: Readonly<MLToggleGroupProps<T>>): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 rounded-control border border-border-subtle bg-surface-sunken p-1',
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onValueChange(option.value)}
          className={cn(
            'ds-body-sm-medium min-h-9 rounded-control px-3 py-1.5',
            'transition-colors duration-fast ease-standard',
            value === option.value
              ? 'bg-surface-card text-text-primary shadow-1'
              : 'text-text-tertiary hover:text-text-primary'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

export interface MLTabDescriptor<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
}

export interface MLTabsProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly tabs: readonly MLTabDescriptor<T>[];
  readonly ariaLabel: string;
  /** Rendered inside the active tabpanel. */
  readonly children: ReactNode;
  readonly idPrefix?: string;
  readonly className?: string;
  /** `fit`: tabs as wide as their labels, left-aligned. `fill` shares the row. */
  readonly layout?: 'fill' | 'fit';
  /** A control at the right end of the tab row — a filter that scopes every tab. */
  readonly trailing?: ReactNode;
}

/**
 * WAI-ARIA tabs with manual activation and roving tabindex: ArrowLeft/Right
 * move, Home/End jump, and only the active tab is in the tab order.
 */
export function MLTabs<T extends string>({
  value,
  onValueChange,
  tabs,
  ariaLabel,
  children,
  idPrefix,
  className,
  layout = 'fill',
  trailing,
}: Readonly<MLTabsProps<T>>): React.JSX.Element {
  const generated = useId();
  const prefix = idPrefix ?? generated;
  const values = useMemo(() => tabs.map((tab) => tab.value), [tabs]);
  /* `fit` scrolls sideways when its labels outgrow a phone. The selected tab
     must never be the one scrolled out of sight — QA found "Sent" clipped at
     390 px with nothing saying it was there — so a change of `value` brings it
     into view. `nearest` on both axes: no page jump when it is already shown. */
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (layout !== 'fit') return;
    const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [layout, value]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const index = values.indexOf(value);
      if (index < 0) return;
      const last = values.length - 1;
      let next = index;
      if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
      else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = last;
      else return;
      event.preventDefault();
      const target = values[next];
      if (target !== undefined) onValueChange(target);
    },
    [values, value, onValueChange]
  );

  return (
    <div className={cn('flex w-full flex-col gap-4', className)}>
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-hairline">
        <div
          ref={listRef}
          role="tablist"
          aria-label={ariaLabel}
          onKeyDown={onKeyDown}
          className={cn(
            '-mb-px flex items-center gap-1',
            layout === 'fill' ? 'w-full' : 'max-w-full overflow-x-auto'
          )}
        >
          {tabs.map((tab) => {
            const active = tab.value === value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                id={`${prefix}-tab-${tab.value}`}
                aria-selected={active}
                aria-controls={`${prefix}-panel-${tab.value}`}
                tabIndex={active ? 0 : -1}
                onClick={() => onValueChange(tab.value)}
                className={cn(
                  'ds-body-base-medium h-10 whitespace-nowrap border-b-2 px-4',
                  /* A phone gets 8 px back per tab side in `fit`: four
                     labelled tabs with counts fit 360 px instead of scrolling. */
                  layout === 'fill' ? 'flex-1' : 'flex-none max-sm:px-3',
                  'transition-colors duration-fast ease-standard',
                  active
                    ? 'border-accent text-text-accent'
                    : 'border-transparent text-text-tertiary hover:text-text-primary'
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {trailing && <div className="ml-auto flex items-center gap-2 pb-1">{trailing}</div>}
      </div>
      <div
        role="tabpanel"
        id={`${prefix}-panel-${value}`}
        aria-labelledby={`${prefix}-tab-${value}`}
        tabIndex={0}
        className="flex w-full flex-col"
      >
        {children}
      </div>
    </div>
  );
}

// ── Progress ─────────────────────────────────────────────────────────────────

export interface MLProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–100. Values outside the range are clamped rather than rejected. */
  readonly value: number;
  readonly tone?: 'accent' | 'success' | 'warning' | 'error';
  readonly ariaLabel: string;
  readonly className?: string;
}

const PROGRESS_TONE: Record<NonNullable<MLProgressProps['tone']>, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  // A meter that has run out is the validation/system family, not ledger red.
  error: 'bg-formError',
};

export const MLProgress = forwardRef<HTMLDivElement, MLProgressProps>(function MLProgress(
  { value, tone = 'accent', ariaLabel, className, ...rest },
  ref
) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-pill bg-surface-sunken', className)}
      {...rest}
    >
      <div
        className={cn(
          'h-full rounded-pill transition-all duration-base ease-standard',
          PROGRESS_TONE[tone]
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
});

// ── Icon button ──────────────────────────────────────────────────────────────

export interface MLIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon button with no accessible name is a defect (R-A-2). */
  readonly 'aria-label': string;
  readonly className?: string;
}

export const MLIconButton = forwardRef<HTMLButtonElement, MLIconButtonProps>(function MLIconButton(
  { className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control',
        'text-text-tertiary transition-colors duration-fast ease-standard',
        'hover:bg-surface-hover hover:text-text-primary',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className
      )}
      {...rest}
    />
  );
});
