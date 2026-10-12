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

  /* Owner, 12 Oct 2026: "reduce the size … make it collapsible if the user
     doesn't want to see". Closed, the whole strip is ONE thin row that is
     itself the toggle — the first figure and a chevron on a phone, every
     figure on one line from `sm` up — never two or three wrapped lines of
     numbers above the list. Open, the compact cards. */
  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="stat-summary">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? labels.hide : labels.show}
        onClick={toggle}
        className={cn(
          'ub-hit flex min-h-9 w-full items-center gap-2 rounded-control border border-border-hairline bg-surface-card px-3 py-1.5 text-left',
          'outline-none transition-colors hover:bg-surface-hover focus-visible:shadow-focus motion-reduce:transition-none'
        )}
      >
        {/* Open, the cards say it all: the row says "Hide" rather than printing
            a figure twice. */}
        {open && <span className="ds-caption flex-1 text-text-accent">{labels.hide}</span>}
        {!open && (
          <dl className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-4 overflow-hidden">
            {items.map((item, index) => (
              <div
                key={item.key}
                className={cn(
                  'flex min-w-0 shrink-0 items-baseline gap-1.5',
                  index > 0 && 'max-sm:hidden'
                )}
              >
                <dt className="ds-caption truncate text-text-tertiary">{item.label}</dt>
                <dd
                  className={cn(
                    'ds-body-sm-medium ds-num whitespace-nowrap',
                    TONE[item.tone ?? 'default']
                  )}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <span className="ds-caption inline-flex shrink-0 items-center gap-0.5 text-text-accent">
          {items.length > 1 && !open && (
            <span className="ds-caption text-text-tertiary sm:hidden">+{items.length - 1}</span>
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              'h-4 w-4 transition-transform motion-reduce:transition-none',
              open && 'rotate-180'
            )}
          />
        </span>
      </button>
      <div id={panelId} hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}

UbStatSummaryBase.displayName = 'UbStatSummary';
export const UbStatSummary = memo(UbStatSummaryBase);
