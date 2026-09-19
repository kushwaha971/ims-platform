'use client';

import { memo, type ElementType } from 'react';

import { MLBox, type MLPolymorphicProps } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — the generic container, and the seat BrandHub's `BHBox` fills
 * in the Customer module. A feature never writes `<div>`; it writes `UbBox`,
 * or one of the components below it that already knows its own layout
 * (`UbStack`, `UbGrid`, `UbCard`, `UbPageShell`).
 *
 * `as` is how semantics survive the move: `<UbBox as="main">` is still a
 * landmark, `<UbBox as="dl">` is still a description list, `<UbBox as="li">` is
 * still a list item. The rendered DOM after this refactor is byte-for-byte the
 * DOM before it — that is the contract the screen tests hold us to.
 *
 * `className` remains the escape hatch, exactly as `sx` is in BrandHub: use it
 * for the responsive modifier or the one-off token a prop does not cover, never
 * to re-implement a prop that exists.
 */
export type UbBoxProps<E extends ElementType = 'div'> = MLPolymorphicProps<E>;

function UbBoxBase<E extends ElementType = 'div'>({
  as,
  className,
  ...rest
}: UbBoxProps<E>): React.JSX.Element {
  return <MLBox as={(as ?? 'div') as ElementType} className={cn(className)} {...rest} />;
}

UbBoxBase.displayName = 'UbBox';

/**
 * `memo` per R-C-3 (mandatory on every `Ub*`). The cast keeps the generic —
 * `memo()` erases type parameters, and losing `as` would lose the type-checking
 * that is the whole reason this component is polymorphic rather than `any`.
 */
export const UbBox = memo(UbBoxBase) as typeof UbBoxBase;
