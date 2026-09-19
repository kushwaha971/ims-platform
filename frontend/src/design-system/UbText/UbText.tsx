'use client';

import { memo, type ElementType } from 'react';

import { MLBox, type MLPolymorphicProps } from 'src/design-system/primitives';
import {
  UB_TEXT_ALIGN,
  UB_TEXT_TONE,
  UB_TEXT_VARIANT,
  type UbAlign,
  type UbTextTone,
  type UbTextVariant,
} from 'src/design-system/scale';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.2.2 — ALL text. This is the seat BrandHub's `BHTypography` fills:
 * in the Customer module every string on the screen goes through it (235 call
 * sites there, against zero raw `<p>` and ten `<span>`s), and `variant` is what
 * decides the tier.
 *
 * Two props, deliberately separate, because conflating them is how heading
 * order gets broken:
 *
 *  - `variant` is the VISUAL tier — one of the thirteen `ds-*` roles the
 *    typography plugin registers. Writing `text-[13.5px] leading-[1.5]` instead
 *    is what R-S-5 forbids.
 *  - `as` is the SEMANTIC element, and it defaults to `<p>`. A page title is
 *    `<UbText as="h1" variant="h2">` because §23.2.2's `ds-h2` is what a phone
 *    shows for the first heading; the DOM still carries an `h1`, the outline is
 *    still correct, and a screen reader still announces level 1.
 *
 * `ds-label` carries the Devanagari rule of §23.2.2 in CSS — 12.5 px / 1.4 /
 * 600 sentence case, rising to 13 px / 1.5 under `:lang(hi)`, never uppercased
 * and never tracked. `ds-label-caps` is the Latin-only tier and must not be put
 * on a translated string (R-S-5).
 */
export type UbTextOwnProps = {
  readonly variant?: UbTextVariant;
  readonly tone?: UbTextTone;
  readonly align?: UbAlign;
  /** One line with an ellipsis. Needs a min-width-0 parent to bite. */
  readonly truncate?: boolean;
};

export type UbTextProps<E extends ElementType = 'p'> = UbTextOwnProps & MLPolymorphicProps<E>;

function UbTextBase<E extends ElementType = 'p'>({
  as,
  variant = 'body',
  tone = 'primary',
  align,
  truncate = false,
  className,
  ...rest
}: UbTextProps<E>): React.JSX.Element {
  return (
    <MLBox
      as={(as ?? 'p') as ElementType}
      className={cn(
        UB_TEXT_VARIANT[variant],
        UB_TEXT_TONE[tone],
        align && UB_TEXT_ALIGN[align],
        truncate && 'truncate',
        className
      )}
      {...rest}
    />
  );
}

UbTextBase.displayName = 'UbText';
export const UbText = memo(UbTextBase) as typeof UbTextBase;
