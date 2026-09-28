'use client';

import { Children, Fragment, memo, useState, type ReactNode } from 'react';

import { ChevronDown } from 'lucide-react';

import { cn } from 'src/utils/cn';

/**
 * One bordered card that stacks sections with a hairline between each —
 * BrandHub `OrderRightPanel` (order detail's right column, Figma 13003:8718)
 * and `DashboardCard` (the "Needs attention" / "Active orders" lists).
 *
 * A column of separate cards is what the design moved AWAY from: every card
 * brings its own border, radius and 16 px of air, and four of them read as
 * four unrelated things. One card with dividers reads as one subject's facts.
 *
 * Falsy children are skipped, so a section that does not apply leaves no
 * orphan divider behind.
 */
export interface UbPanelProps {
  readonly children: ReactNode;
  /** `aside` for a right column; `section` for a list in the main column. */
  readonly as?: 'aside' | 'section' | 'div';
  readonly className?: string;
}

function UbPanelBase({ children, as: Element = 'div', className }: Readonly<UbPanelProps>) {
  const sections = Children.toArray(children).filter(Boolean);
  return (
    <Element
      className={cn(
        'flex w-full flex-col self-start overflow-hidden rounded-card border border-border-hairline bg-surface-card',
        className
      )}
    >
      {sections.map((section, index) => (
        <Fragment key={index}>
          {index > 0 && <div aria-hidden className="h-px w-full bg-border-hairline" />}
          {section}
        </Fragment>
      ))}
    </Element>
  );
}

UbPanelBase.displayName = 'UbPanel';
export const UbPanel = memo(UbPanelBase);

/**
 * One section of a `UbPanel` — BrandHub `OrderPanelSection`: 16 px padding, a
 * 14/20 medium title with an optional badge, 16 px to the content. With
 * `collapsible` the title row becomes the toggle and a chevron turns with it.
 */
export interface UbPanelSectionProps {
  readonly title: ReactNode;
  readonly badge?: ReactNode;
  /** Right end of the title row — a small action ("Edit"). */
  readonly action?: ReactNode;
  readonly collapsible?: boolean;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

function UbPanelSectionBase({
  title,
  badge,
  action,
  collapsible = false,
  defaultOpen = true,
  children,
  className,
}: Readonly<UbPanelSectionProps>) {
  const [open, setOpen] = useState(defaultOpen);

  const heading = (
    <span className="ds-body-base-medium line-clamp-2 min-w-0 flex-1 text-left text-text-primary">
      {title}
    </span>
  );

  if (!collapsible) {
    return (
      <section className={cn('flex flex-col gap-4 p-4', className)}>
        <div className="flex items-center gap-2">
          {heading}
          {badge}
          {action}
        </div>
        {children}
      </section>
    );
  }

  return (
    <section className={cn('flex flex-col p-4', className)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="group flex min-w-0 flex-1 items-center gap-2 rounded-xs text-left outline-none focus-visible:shadow-focus"
        >
          {heading}
          {badge}
          <ChevronDown
            aria-hidden
            className={cn(
              'h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-fast',
              open && 'rotate-180'
            )}
          />
        </button>
        {action}
      </div>
      {open && <div className="flex flex-col gap-4 pt-4">{children}</div>}
    </section>
  );
}

UbPanelSectionBase.displayName = 'UbPanelSection';
export const UbPanelSection = memo(UbPanelSectionBase);
