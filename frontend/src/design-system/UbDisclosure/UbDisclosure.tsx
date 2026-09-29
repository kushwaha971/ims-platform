'use client';

import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { ChevronDown } from 'lucide-react';

import { cn } from 'src/utils/cn';

/**
 * A section a long form can fold away. Part 23 §23.3.
 *
 * ── Why this exists rather than a `<details>` ───────────────────────────────
 * `<details>`/`<summary>` is the tempting answer and is wrong here in two
 * ways. Its open state is DOM state, not React state, so a form cannot open a
 * group because a field inside it has an error — which is exactly what has to
 * happen when the server refuses a GSTIN the merchant typed into a collapsed
 * section. And its summary is not a button to every assistive technology; the
 * `aria-expanded` relationship this builds is.
 *
 * ── Collapsed means UNRENDERED ──────────────────────────────────────────────
 * Not `hidden`, not `h-0 overflow-hidden`. A visually hidden fieldset is still
 * in the tab order, so a merchant tabbing from the last visible field lands in
 * a section they cannot see, types into it and has no idea where the text went.
 * Unmounting costs the fields' local state — which is fine, because React Hook
 * Form holds the values, not the inputs.
 *
 * ── Unless it is CONTENT: `keepMounted` ─────────────────────────────────────
 * A public page's FAQ is the opposite case (CR-2026-09-29-PLATFORM-C). Its
 * answers are the page's copy, and an unrendered answer is one that no search
 * engine, no find-in-page and no reader-mode can see. With `keepMounted` the
 * panel is always rendered and carries the `hidden` attribute while closed —
 * `display: none`, so it is out of the tab order and the accessibility tree
 * exactly as an unmounted one is, which is the property the rule above is for.
 *
 * After hydration the attribute is upgraded to `hidden="until-found"` where the
 * browser supports it: Ctrl-F then finds text inside a closed answer, and the
 * browser's `beforematch` opens it. React 19 renders `hidden` as a boolean
 * only, so the upgrade is done on the element, and redone whenever React
 * writes the boolean back (every close).
 */
export interface UbDisclosureProps {
  readonly label: string;
  /** A short line under the label: what is in here and why it is optional. */
  readonly hint?: string;
  readonly defaultOpen?: boolean;
  /**
   * Forces it open — the form passes `true` when a field inside has an error,
   * because an error in a section nobody can see is an error nobody can fix.
   */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * `md` (default) is the in-form disclosure. `lg` is a question on a public
   * page — the landing page's FAQ — where the question is the content and a
   * 12 px label would read as a footnote.
   */
  readonly size?: 'md' | 'lg';
  /**
   * Render the panel while closed, `hidden`, instead of not at all. For
   * content (an FAQ answer), never for form fields — see the header.
   */
  readonly keepMounted?: boolean;
}

function UbDisclosureBase({
  label,
  hint,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
  className,
  size = 'md',
  keepMounted = false,
}: Readonly<UbDisclosureProps>) {
  const large = size === 'lg';
  const id = useId();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;

  const toggle = () => {
    const next = !isOpen;
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!keepMounted || isOpen || !panel || !('onbeforematch' in document.body)) return undefined;
    panel.setAttribute('hidden', 'until-found');
    const reveal = () => {
      setInternalOpen(true);
      onOpenChange?.(true);
    };
    panel.addEventListener('beforematch', reveal);
    return () => panel.removeEventListener('beforematch', reveal);
  }, [keepMounted, isOpen, onOpenChange]);

  return (
    <div className={cn('flex flex-col rounded-card border border-border-hairline', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={`${id}-panel`}
        id={`${id}-trigger`}
        className={cn(
          'flex min-h-11 w-full items-center justify-between gap-3 rounded-card px-4 py-3',
          large && 'min-h-14 px-5 py-4',
          'text-left transition-colors hover:bg-surface-hover',
          'focus-visible:shadow-focus focus-visible:outline-none'
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              large ? 'ds-body-l-medium' : 'ds-body-sm-medium',
              'text-text-primary'
            )}
          >
            {label}
          </span>
          {hint && <span className="ds-caption text-text-tertiary">{hint}</span>}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'h-4 w-4 shrink-0 text-text-tertiary transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      {(isOpen || keepMounted) && (
        <div
          ref={panelRef}
          id={`${id}-panel`}
          role="region"
          aria-labelledby={`${id}-trigger`}
          hidden={!isOpen}
          // `flex` only while open: an author `display` beats the `[hidden]`
          // rule (same specificity, later layer), and the closed panel would
          // simply stay on screen.
          className={cn(
            isOpen && 'flex flex-col gap-4',
            'border-t border-border-hairline px-4 py-4',
            large && 'px-5 pb-5'
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

UbDisclosureBase.displayName = 'UbDisclosure';
export const UbDisclosure = memo(UbDisclosureBase);
