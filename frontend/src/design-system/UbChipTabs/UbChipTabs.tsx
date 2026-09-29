'use client';

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { cn } from 'src/utils/cn';

/**
 * WAI-ARIA tabs drawn as a row of pills, with ONE indicator that slides from
 * the old tab to the new one — the landing page's use-case explorer.
 *
 * Why not `UbTabs`: that is the underlined in-page tab row of a settings
 * screen, and its arrow keys move the selection without moving focus, which
 * is right for manual activation and wrong for a showcase where the panel IS
 * the point. Here activation is automatic: ArrowLeft/Right (wrapping),
 * Home/End select AND focus the tab, and only the selected tab is in the Tab
 * order (roving tabindex).
 *
 * The indicator is measured after layout; until it is (server render, no
 * JavaScript), the selected pill paints its own fill, so the row never shows
 * no selection. The slide is `--dur-base`, 0 under reduced motion. The panel
 * is re-keyed per tab and fades in over `--dur-panel` (`.ub-panel-in`).
 */
export interface UbChipTab<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: ReactNode;
}

export interface UbChipTabsProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly tabs: readonly UbChipTab<T>[];
  readonly ariaLabel: string;
  /** Rendered in the selected tab's panel. */
  readonly children: ReactNode;
  readonly className?: string;
  readonly listClassName?: string;
  readonly panelClassName?: string;
}

interface Indicator {
  readonly left: number;
  readonly width: number;
}

export function UbChipTabs<T extends string>({
  value,
  onValueChange,
  tabs,
  ariaLabel,
  children,
  className,
  listClassName,
  panelClassName,
}: Readonly<UbChipTabsProps<T>>): React.JSX.Element {
  const prefix = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<Indicator | null>(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !tab) return;
    setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, value]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => measure());
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const index = tabs.findIndex((tab) => tab.value === value);
      if (index < 0) return;
      const last = tabs.length - 1;
      let next: number;
      if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
      else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = last;
      else return;
      event.preventDefault();
      const target = tabs[next];
      if (!target) return;
      onValueChange(target.value);
      listRef.current
        ?.querySelector<HTMLElement>(`#${CSS.escape(`${prefix}-tab-${target.value}`)}`)
        ?.focus();
    },
    [tabs, value, onValueChange, prefix]
  );

  const measured = indicator !== null && indicator.width > 0;

  return (
    <div className={cn('flex w-full flex-col', className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className={cn(
          'relative flex w-fit max-w-full items-center gap-1 rounded-pill border border-border-hairline bg-surface-card/70 p-1 backdrop-blur',
          listClassName
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute bottom-1 top-1 rounded-pill bg-accent shadow-sm',
            'transition-[transform,width] duration-base ease-entrance',
            !measured && 'opacity-0'
          )}
          style={
            measured
              ? { width: indicator.width, transform: `translateX(${indicator.left - 4}px)`, left: 4 }
              : undefined
          }
        />
        {tabs.map((tab) => {
          const selected = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              id={`${prefix}-tab-${tab.value}`}
              aria-selected={selected}
              aria-controls={`${prefix}-panel-${tab.value}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(tab.value)}
              className={cn(
                'relative z-10 inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-pill px-4 ds-body-base-medium',
                'transition-colors duration-fast ease-standard',
                'outline-none focus-visible:shadow-focus',
                selected
                  ? cn('text-text-inverse', !measured && 'bg-accent')
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        key={value}
        role="tabpanel"
        id={`${prefix}-panel-${value}`}
        aria-labelledby={`${prefix}-tab-${value}`}
        tabIndex={0}
        className={cn('ub-panel-in outline-none focus-visible:shadow-focus', panelClassName)}
      >
        {children}
      </div>
    </div>
  );
}

UbChipTabs.displayName = 'UbChipTabs';
