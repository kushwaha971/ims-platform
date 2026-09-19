'use client';

/* =============================================================================
 * ⚠️  STAND-IN FOR `ml-uikit` — see ./index.ts for the swap instructions.
 * =============================================================================
 *
 * Sprint 0's stand-in deliberately shipped NO overlay primitives, with the note
 * that "anything that needs a focus trap or a portal … is deliberately ABSENT
 * so that nobody builds `UbDialog` on a fake primitive".
 *
 * Sprint 1 needs two of them — PLT-15 FR-6's `PlanLimitDialog` and PLT-04's
 * "Leave business" `UbConfirmDialog` and tenant menu — and the registry is
 * still unreachable. So rather than faking them, the portal, the focus trap,
 * the Escape handling, the scroll lock and the focus restore are IMPLEMENTED
 * here, accessibly, against the WAI-ARIA dialog and menu patterns. The `Ub*`
 * wrappers above are written against the same surface Radix exposes, so the
 * swap remains a change to ./index.ts and nothing else.
 *
 * KNOWN GAPS versus Radix, and why they are acceptable at MVP:
 *  - no `aria-hidden` / `inert` on the background tree (the trap is complete,
 *    so keyboard and screen-reader focus cannot leave the dialog anyway);
 *  - no nested-overlay stack (nothing in Sprints 1–3 opens a dialog from a
 *    dialog; a second one would need a depth counter for the scroll lock);
 *  - the menu closes on outside pointerdown and Escape, and does not implement
 *    typeahead.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { createPortal } from 'react-dom';

import { cn } from 'src/utils/cn';

/** Everything focusable, in DOM order, that is not disabled or hidden. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Deliberately NOT filtered on `offsetParent`: that is a layout read, it is
 * always null in jsdom, and a trap that silently finds nothing is worse than
 * one that occasionally includes a hidden control. `hidden` and `aria-hidden`
 * are declarative and are the two cases that actually occur in these overlays.
 */
const focusableWithin = (root: HTMLElement): readonly HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (node) => !node.hasAttribute('hidden') && node.getAttribute('aria-hidden') !== 'true'
  );

// ── Dialog ───────────────────────────────────────────────────────────────────

export interface MLDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly labelledBy: string;
  readonly describedBy?: string;
  /** False for a destructive confirm: a stray backdrop tap must not dismiss. */
  readonly dismissOnBackdrop?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * A modal dialog: portalled to `document.body`, `aria-modal`, focus trapped,
 * Escape-dismissible, body scroll locked, and focus restored to the opener on
 * close. Below `sm` it is a bottom sheet (PLT-15 §7), above it a centred card.
 */
export function MLDialog({
  open,
  onOpenChange,
  labelledBy,
  describedBy,
  dismissOnBackdrop = true,
  children,
  className,
}: Readonly<MLDialogProps>): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Remember the opener, move focus in, lock scroll — and undo all three.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    if (panel) {
      const first = focusableWithin(panel)[0];
      (first ?? panel).focus();
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onOpenChange(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = focusableWithin(panel);
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onOpenChange]
  );

  // A portal needs a DOM. There is none on the server — and there does not need
  // to be: `open` is false in every server render, because opening a dialog is
  // always a client interaction, so this branch never produces a hydration
  // mismatch and no `mounted` flag is required to avoid one.
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        aria-hidden
        onPointerDown={dismissOnBackdrop ? () => onOpenChange(false) : undefined}
        className="absolute inset-0 bg-[rgba(0,0,0,0.45)]"
      />
          <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          'relative z-10 flex w-full flex-col gap-4 bg-surface-raised p-5 shadow-4',
          'max-h-[90dvh] overflow-y-auto rounded-t-card sm:max-w-[480px] sm:rounded-card',
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

export interface MLDialogTitleProps {
  readonly id: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function MLDialogTitle({
  id,
  children,
  className,
}: Readonly<MLDialogTitleProps>): React.JSX.Element {
  return (
    <h2 id={id} className={cn('ds-h3 text-text-primary', className)}>
      {children}
    </h2>
  );
}

export function MLDialogDescription({
  id,
  children,
  className,
}: Readonly<MLDialogTitleProps>): React.JSX.Element {
  return (
    <p id={id} className={cn('ds-body-sm text-text-tertiary', className)}>
      {children}
    </p>
  );
}

export function MLDialogFooter({
  children,
  className,
}: Readonly<{ readonly children: ReactNode; readonly className?: string }>): React.JSX.Element {
  return (
    <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}>
      {children}
    </div>
  );
}

// ── Menu ─────────────────────────────────────────────────────────────────────

export interface MLMenuProps {
  /**
   * The CONTENT of the trigger button. The button itself belongs to the menu,
   * because `aria-haspopup`, `aria-expanded`, the ref the focus-return needs and
   * the open/close wiring are the pattern, not the caller's business.
   */
  readonly trigger: ReactNode;
  readonly triggerClassName?: string;
  readonly triggerLabel?: string;
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly align?: 'start' | 'end';
  readonly className?: string;
}

/**
 * The WAI-ARIA menu-button pattern: ArrowDown/ArrowUp move between items, Home
 * and End jump, Escape closes and returns focus to the trigger, and a pointer
 * outside closes it. Items are `MLMenuItem`.
 */
export function MLMenu({
  trigger,
  triggerClassName,
  triggerLabel,
  ariaLabel,
  children,
  align = 'start',
  className,
}: Readonly<MLMenuProps>): React.JSX.Element {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const items = listRef.current ? focusableWithin(listRef.current) : [];
    items[0]?.focus();
  }, [open]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const list = listRef.current;
    if (!list) return;
    if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false);
      triggerRef.current?.focus();
      if (event.key === 'Escape') event.preventDefault();
      return;
    }
    const items = focusableWithin(list);
    if (items.length === 0) return;
    const index = items.findIndex((node) => node === document.activeElement);
    const last = items.length - 1;
    let next = index;
    if (event.key === 'ArrowDown') next = index >= last ? 0 : index + 1;
    else if (event.key === 'ArrowUp') next = index <= 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    items[next]?.focus();
  }, []);

  const onToggle = useCallback(() => setOpen((value) => !value), []);

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        id={`${id}-trigger`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={onToggle}
        className={cn(
          'flex min-h-11 w-full items-center gap-2 rounded-control px-2 py-1.5 text-left',
          'transition-colors duration-fast ease-standard hover:bg-surface-hover',
          triggerClassName
        )}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-label={ariaLabel}
          aria-labelledby={`${id}-trigger`}
          onKeyDown={onKeyDown}
          className={cn(
            'absolute z-40 mt-1 flex w-[min(320px,calc(100vw-32px))] flex-col gap-0.5',
            'rounded-card border border-border-hairline bg-surface-raised p-1.5 shadow-3',
            align === 'end' ? 'right-0' : 'left-0'
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface MLMenuItemProps {
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

export function MLMenuItem({
  onSelect,
  disabled,
  selected,
  children,
  className,
}: Readonly<MLMenuItemProps>): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2 text-left',
        'ds-body-sm text-text-primary transition-colors duration-fast ease-standard',
        'hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45',
        selected && 'bg-accent-quiet',
        className
      )}
    >
      {children}
    </button>
  );
}

export function MLMenuLabel({
  children,
  className,
}: Readonly<{ readonly children: ReactNode; readonly className?: string }>): React.JSX.Element {
  return (
    <span className={cn('ds-label px-3 pb-1 pt-2 text-text-muted', className)}>{children}</span>
  );
}
