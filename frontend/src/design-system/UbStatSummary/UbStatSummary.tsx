'use client';

import { memo, useId, useState, useSyncExternalStore, type ReactNode } from 'react';

import { ChevronDown } from 'lucide-react';

import { cn } from 'src/utils/cn';

/**
 * Figures as ONE line, with the full cards a tap away.
 *
 * Owner, 6 Oct 2026: the stat cards above a screen took the space its content
 * needed. Closing them entirely would hide the numbers a merchant opens the
 * screen for ("what do I collect today"), so the owner chose this: the key
 * figures always visible as a compact strip, and "Details" expanding the
 * cards. The choice is remembered per screen on this device — a per-viewer
 * convenience, so a blocked or empty storage just means the default (closed).
 */
export interface UbStatSummaryItem {
  readonly key: string;
  readonly label: string;
  /** Already formatted: "₹85,275.23", "26 items". */
  readonly value: string;
  /** Colours the figure only; the label always carries the meaning. */
  readonly tone?: 'default' | 'positive' | 'negative' | 'warning';
}

export interface UbStatSummaryProps {
  readonly items: readonly UbStatSummaryItem[];
  /** The full cards, shown when expanded. */
  readonly children: ReactNode;
  /** Remembers the open state per screen, e.g. "dashboard". */
  readonly storageKey: string;
  readonly labels: { readonly show: string; readonly hide: string };
  readonly className?: string;
}

const TONE: Record<NonNullable<UbStatSummaryItem['tone']>, string> = {
  default: 'text-text-primary',
  positive: 'text-success',
  negative: 'text-error',
  warning: 'text-warning',
};

const read = (key: string): boolean => {
  try {
    return window.localStorage.getItem(`ub.statSummary.${key}`) === 'open';
  } catch {
    return false;
  }
};

const write = (key: string, open: boolean): void => {
  try {
    window.localStorage.setItem(`ub.statSummary.${key}`, open ? 'open' : 'closed');
  } catch {
    /* storage blocked: the default is fine */
  }
};

const noSubscription = (): (() => void) => () => undefined;

function UbStatSummaryBase({
  items,
  children,
  storageKey,
  labels,
  className,
}: Readonly<UbStatSummaryProps>) {
  const panelId = useId();
  // The stored choice is read after hydration (the server renders closed);
  // a tap overrides it for the life of the screen and is written back.
  const stored = useSyncExternalStore(
    noSubscription,
    () => read(storageKey),
    () => false
  );
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? stored;
  const toggle = () => {
    write(storageKey, !open);
    setChoice(!open);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)} data-testid="stat-summary">
      <div
        className={cn(
          'flex items-start gap-2',
          open
            ? 'justify-end'
            : 'rounded-card border border-border-hairline bg-surface-card px-3 py-2 ' +
                // docs/mobile-redesign (A4) — on a phone the figures are one
                // summary line under the title, not a bordered box.
                'max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:px-0 max-lg:py-0'
        )}
      >
        {/* Open, the cards say it all: the line steps aside to its toggle
            rather than printing every figure twice. */}
        {!open && (
          <dl className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1">
            {items.map((item) => (
              <div key={item.key} className="flex items-baseline gap-1.5">
                <dt className="ds-caption text-text-tertiary">{item.label}</dt>
                <dd className={cn('ds-body-sm-medium ds-num', TONE[item.tone ?? 'default'])}>
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="ub-hit ds-caption inline-flex shrink-0 items-center gap-1 rounded-control px-2 py-1 text-text-accent outline-none hover:bg-surface-hover focus-visible:shadow-focus"
        >
          {open ? labels.hide : labels.show}
          <ChevronDown
            aria-hidden
            className={cn(
              'h-4 w-4 transition-transform motion-reduce:transition-none',
              open && 'rotate-180'
            )}
          />
        </button>
      </div>
      <div id={panelId} hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}

UbStatSummaryBase.displayName = 'UbStatSummary';
export const UbStatSummary = memo(UbStatSummaryBase);
