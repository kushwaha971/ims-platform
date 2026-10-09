'use client';

import { memo, type ReactNode } from 'react';

import Link from 'next/link';

import { ChevronRight } from 'lucide-react';

import { cn } from 'src/utils/cn';

/**
 * docs/mobile-redesign/04 §6.1 — the pieces a phone's home screen is made of,
 * shared by every app's home (the Shop's dashboard, a library's Today, a
 * lender's round) so "how is my day" reads the same wherever a person works.
 *
 *  · `UbHeroPair` — the two numbers asked first, each opening its list.
 *  · `UbMiniStatStrip` — today's other figures, one sideways-scrolling row
 *    instead of a 2 × 4 grid that pushed the first action below the fold.
 *  · `UbQuickActions` — up to four equal, worded shortcuts in the thumb zone.
 *  · `UbAttentionList` — the screen as a to-do: rows that say what needs doing.
 *
 * They are phone shapes: callers render them on the phone layer and keep the
 * desktop dashboard as it is.
 */
type Tone = 'default' | 'danger' | 'success' | 'warning' | 'info';

const TONE_TEXT: Readonly<Record<Tone, string>> = {
  default: 'text-text-primary',
  danger: 'text-error',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-text-accent',
};

const TONE_TILE: Readonly<Record<Tone, string>> = {
  default: 'bg-surface-sunken text-text-secondary',
  danger: 'bg-error-dim text-error',
  success: 'bg-success-dim text-success',
  warning: 'bg-warning-dim text-warning',
  info: 'bg-accent-quiet text-text-accent',
};

export interface UbHeroFigure {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly href: string;
  readonly tone?: Tone;
  /** The whole sentence for a screen reader: "To collect: ₹11,260. Open the list". */
  readonly ariaLabel?: string;
}

function UbHeroPairBase({
  figures,
  className,
}: Readonly<{ figures: readonly UbHeroFigure[]; className?: string }>) {
  return (
    <div
      className={cn(
        'grid divide-x divide-border-hairline rounded-card border border-border-hairline bg-surface-card',
        className
      )}
      style={{ gridTemplateColumns: `repeat(${Math.max(figures.length, 1)}, minmax(0, 1fr))` }}
    >
      {figures.map((figure) => (
        <Link
          key={figure.key}
          href={figure.href}
          aria-label={figure.ariaLabel}
          className="flex min-w-0 flex-col gap-0.5 p-4 outline-none transition-colors hover:bg-surface-hover focus-visible:shadow-focus active:bg-surface-hover"
        >
          <span className="flex items-center gap-1 text-[13px] leading-[18px] text-text-tertiary">
            {figure.label}
            <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </span>
          <span
            className={cn(
              'ds-num truncate text-[24px] font-semibold leading-9',
              TONE_TEXT[figure.tone ?? 'default']
            )}
          >
            {figure.value}
          </span>
        </Link>
      ))}
    </div>
  );
}

export interface UbMiniStat {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly href?: string;
  readonly tone?: Tone;
}

function UbMiniStatStripBase({
  stats,
  label,
  className,
}: Readonly<{ stats: readonly UbMiniStat[]; label: string; className?: string }>) {
  return (
    <ul
      aria-label={label}
      className={cn(
        '-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      {stats.map((stat) => {
        const body = (
          <>
            <span className="text-[12px] leading-4 text-text-tertiary">{stat.label}</span>
            <span
              className={cn(
                'ds-num text-[17px] font-semibold leading-6',
                TONE_TEXT[stat.tone ?? 'default']
              )}
            >
              {stat.value}
            </span>
          </>
        );
        const box =
          'flex min-w-[8.5rem] flex-col gap-0.5 rounded-card border border-border-hairline bg-surface-subtle px-3 py-2.5';
        return (
          <li key={stat.key} className="flex shrink-0">
            {stat.href ? (
              <Link
                href={stat.href}
                className={cn(
                  box,
                  'outline-none focus-visible:shadow-focus active:bg-surface-hover'
                )}
              >
                {body}
              </Link>
            ) : (
              <div className={box}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface UbQuickAction {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly href: string;
}

function UbQuickActionsBase({
  actions,
  label,
  className,
}: Readonly<{ actions: readonly UbQuickAction[]; label: string; className?: string }>) {
  return (
    <ul
      aria-label={label}
      className={cn('grid gap-2', className)}
      style={{
        gridTemplateColumns: `repeat(${Math.min(Math.max(actions.length, 1), 4)}, minmax(0, 1fr))`,
      }}
    >
      {actions.map((action) => (
        <li key={action.key} className="flex">
          <Link
            href={action.href}
            className="flex w-full flex-col items-center gap-1.5 rounded-card px-1 py-2 text-center outline-none focus-visible:shadow-focus active:bg-surface-hover"
          >
            <span
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent-quiet text-text-accent [&_svg]:h-6 [&_svg]:w-6"
            >
              {action.icon}
            </span>
            <span className="text-[12.5px] font-medium leading-4 text-text-primary">
              {action.label}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export interface UbAttentionItem {
  readonly key: string;
  readonly title: string;
  readonly caption?: string;
  readonly icon: ReactNode;
  readonly href: string;
  readonly tone?: Tone;
}

function UbAttentionListBase({
  items,
  className,
}: Readonly<{ items: readonly UbAttentionItem[]; className?: string }>) {
  return (
    <ul className={cn('-mx-4 flex flex-col', className)}>
      {items.map((item, index) => (
        <li key={item.key} className="flex">
          <Link
            href={item.href}
            className="relative flex min-h-16 w-full items-center gap-3 px-4 py-2.5 outline-none focus-visible:shadow-focus active:bg-surface-hover"
          >
            {index > 0 && (
              <span
                aria-hidden
                className="absolute left-[68px] right-0 top-0 border-t border-border-hairline"
              />
            )}
            <span
              aria-hidden
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] [&_svg]:h-5 [&_svg]:w-5',
                TONE_TILE[item.tone ?? 'default']
              )}
            >
              {item.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[16px] font-medium leading-[22px] text-text-primary">
                {item.title}
              </span>
              {item.caption ? (
                <span className="text-[13px] leading-[18px] text-text-tertiary">
                  {item.caption}
                </span>
              ) : null}
            </span>
            <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-tertiary" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

UbHeroPairBase.displayName = 'UbHeroPair';
UbMiniStatStripBase.displayName = 'UbMiniStatStrip';
UbQuickActionsBase.displayName = 'UbQuickActions';
UbAttentionListBase.displayName = 'UbAttentionList';
export const UbHeroPair = memo(UbHeroPairBase);
export const UbMiniStatStrip = memo(UbMiniStatStripBase);
export const UbQuickActions = memo(UbQuickActionsBase);
export const UbAttentionList = memo(UbAttentionListBase);
