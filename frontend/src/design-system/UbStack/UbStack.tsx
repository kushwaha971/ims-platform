'use client';

import { memo, type ElementType } from 'react';

import { MLBox, type MLPolymorphicProps } from 'src/design-system/primitives';
import { UB_GAP, type UbSpace } from 'src/design-system/scale';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — the flex container, and the single most common shape in this
 * codebase: before this wave, `flex flex-col gap-*` appeared on 61 raw `<div>`s
 * across the feature screens.
 *
 * BrandHub reaches the same place with `<BHBox sx={{ display: 'flex',
 * flexDirection: 'column' }}>` and `<BHGrid container>`; the props below are
 * that `sx` block given names, so the intent is readable and the values cannot
 * be invented per screen.
 *
 * `as` keeps the semantics: `<UbStack as="ul">` renders a real `<ul>`, and its
 * rows render `<UbStack as="li">`. Responsive changes of direction stay in
 * `className` (`md:flex-row`), which is the documented escape hatch and the
 * direct analogue of BrandHub's `sx={{ flexDirection: { md: 'row' } }}`.
 */
export type UbStackDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';
export type UbStackAlign = 'start' | 'center' | 'end' | 'baseline' | 'stretch';
export type UbStackJustify = 'start' | 'center' | 'end' | 'between' | 'around';

const DIRECTION: Readonly<Record<UbStackDirection, string>> = {
  row: 'flex-row',
  column: 'flex-col',
  'row-reverse': 'flex-row-reverse',
  'column-reverse': 'flex-col-reverse',
};

const ALIGN: Readonly<Record<UbStackAlign, string>> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  baseline: 'items-baseline',
  stretch: 'items-stretch',
};

const JUSTIFY: Readonly<Record<UbStackJustify, string>> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
};

export type UbStackOwnProps = {
  /** Default `column`: the mobile-first direction (R-S-6). */
  readonly direction?: UbStackDirection;
  readonly gap?: UbSpace;
  readonly align?: UbStackAlign;
  readonly justify?: UbStackJustify;
  readonly wrap?: boolean;
};

export type UbStackProps<E extends ElementType = 'div'> = UbStackOwnProps & MLPolymorphicProps<E>;

function UbStackBase<E extends ElementType = 'div'>({
  as,
  direction = 'column',
  gap = 0,
  align,
  justify,
  wrap = false,
  className,
  ...rest
}: UbStackProps<E>): React.JSX.Element {
  return (
    <MLBox
      as={(as ?? 'div') as ElementType}
      className={cn(
        'flex',
        DIRECTION[direction],
        UB_GAP[gap],
        align && ALIGN[align],
        justify && JUSTIFY[justify],
        wrap && 'flex-wrap',
        className
      )}
      {...rest}
    />
  );
}

UbStackBase.displayName = 'UbStack';
export const UbStack = memo(UbStackBase) as typeof UbStackBase;
