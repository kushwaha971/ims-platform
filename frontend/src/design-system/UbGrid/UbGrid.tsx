'use client';

import { memo, type ElementType } from 'react';

import { MLBox, type MLPolymorphicProps } from 'src/design-system/primitives';
import { UB_GAP, type UbSpace } from 'src/design-system/scale';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — the grid container, and the seat BrandHub's `BHGrid` fills.
 * `BHGrid` is MUI's twelve-column `Grid` with `container`/`item`/`xs`; this one
 * is a CSS grid with a column count, because the screens that need it need
 * "one column on a phone, two on a tablet" and nothing more elaborate.
 *
 * `columns` takes either a number or a per-breakpoint object, which is what
 * keeps `sm:grid-cols-2` out of the call site's `className` — the one place
 * responsive layout was leaking into features before this wave.
 */
export type UbGridColumns = 1 | 2 | 3 | 4 | 6 | 12;

export interface UbGridResponsiveColumns {
  readonly base?: UbGridColumns;
  readonly sm?: UbGridColumns;
  readonly md?: UbGridColumns;
  readonly lg?: UbGridColumns;
}

const BASE_COLS: Readonly<Record<UbGridColumns, string>> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  6: 'grid-cols-6',
  12: 'grid-cols-12',
};

const SM_COLS: Readonly<Record<UbGridColumns, string>> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  6: 'sm:grid-cols-6',
  12: 'sm:grid-cols-12',
};

const MD_COLS: Readonly<Record<UbGridColumns, string>> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  6: 'md:grid-cols-6',
  12: 'md:grid-cols-12',
};

const LG_COLS: Readonly<Record<UbGridColumns, string>> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  6: 'lg:grid-cols-6',
  12: 'lg:grid-cols-12',
};

const columnClasses = (columns: UbGridColumns | UbGridResponsiveColumns): string => {
  if (typeof columns === 'number') return BASE_COLS[columns];
  return cn(
    BASE_COLS[columns.base ?? 1],
    columns.sm && SM_COLS[columns.sm],
    columns.md && MD_COLS[columns.md],
    columns.lg && LG_COLS[columns.lg]
  );
};

export type UbGridOwnProps = {
  readonly columns?: UbGridColumns | UbGridResponsiveColumns;
  readonly gap?: UbSpace;
};

export type UbGridProps<E extends ElementType = 'div'> = UbGridOwnProps & MLPolymorphicProps<E>;

function UbGridBase<E extends ElementType = 'div'>({
  as,
  columns = 1,
  gap = 0,
  className,
  ...rest
}: UbGridProps<E>): React.JSX.Element {
  return (
    <MLBox
      as={(as ?? 'div') as ElementType}
      className={cn('grid', columnClasses(columns), UB_GAP[gap], className)}
      {...rest}
    />
  );
}

UbGridBase.displayName = 'UbGrid';
export const UbGrid = memo(UbGridBase) as typeof UbGridBase;
