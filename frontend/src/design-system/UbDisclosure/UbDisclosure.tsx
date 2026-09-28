'use client';

import { memo, useId, useState, type ReactNode } from 'react';

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
}

function UbDisclosureBase({
  label,
  hint,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
  className,
}: Readonly<UbDisclosureProps>) {
  const id = useId();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;

  const toggle = () => {
    const next = !isOpen;
    setInternalOpen(next);
    onOpenChange?.(next);
  };

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
          'text-left transition-colors hover:bg-surface-hover',
          'focus-visible:shadow-focus focus-visible:outline-none'
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className="ds-body-sm-medium text-text-primary">{label}</span>
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
      {isOpen && (
        <div
          id={`${id}-panel`}
          role="region"
          aria-labelledby={`${id}-trigger`}
          className="flex flex-col gap-4 border-t border-border-hairline px-4 py-4"
        >
          {children}
        </div>
      )}
    </div>
  );
}

UbDisclosureBase.displayName = 'UbDisclosure';
export const UbDisclosure = memo(UbDisclosureBase);
