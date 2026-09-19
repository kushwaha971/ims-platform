'use client';

/* =============================================================================
 * ⚠️  STAND-IN FOR `ml-uikit` — see ./index.ts for the swap instructions.
 * =============================================================================
 *
 * The LAYOUT primitive. BrandHub's design system has exactly one of these —
 * `BHBox`, a thin wrapper over MUI's `Box` whose entire job is to be the one
 * element a feature is allowed to render — and every Customer screen in
 * `apps/frontend/src/modules/customer-management` is built out of it plus
 * `BHGrid` and `BHTypography`. `grep -c '<div'` over those sixty files returns
 * zero.
 *
 * `MLBox` is the same idea in this stack. It is polymorphic because semantics
 * are not negotiable: a heading still has to be an `<h2>` in the DOM, a
 * landmark still has to be a landmark, and a list still has to be a `<ul>` of
 * `<li>`. What it removes is the *choice of class soup* at the call site, not
 * the element.
 *
 * It renders a host element, which is exactly why it lives here in
 * `src/design-system/**` — the one zone `react/forbid-elements` exempts.
 */

import { createElement, type ComponentPropsWithoutRef, type ElementType } from 'react';

/**
 * The polymorphic prop set every `Ub*` layout and typography component is built
 * from: `as` picks the host element, everything else is that element's own
 * props, so `href`, `type`, `aria-*`, `dir` and `lang` keep working and keep
 * being type-checked against the element actually rendered.
 */
export type MLPolymorphicProps<E extends ElementType> = {
  readonly as?: E;
  readonly className?: string;
} & Omit<ComponentPropsWithoutRef<E>, 'as' | 'className'>;

/**
 * The element `MLBox` renders when `as` is omitted. Kept as a named constant so
 * the tests can assert the default rather than restate it.
 */
export const ML_BOX_DEFAULT_ELEMENT = 'div';

export function MLBox<E extends ElementType = 'div'>(
  props: MLPolymorphicProps<E>
): React.JSX.Element {
  const { as, ...rest } = props as MLPolymorphicProps<ElementType> & { as?: ElementType };
  return createElement(as ?? ML_BOX_DEFAULT_ELEMENT, rest as Record<string, unknown>);
}

MLBox.displayName = 'MLBox';
