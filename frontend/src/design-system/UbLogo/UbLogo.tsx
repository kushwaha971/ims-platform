'use client';

import { memo } from 'react';

import { APP_NAME } from 'src/constants';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.2.6 (CR-2026-09-19-D) — the brand mark, as a component.
 *
 * The mark existed as `public/icons/icon-512.png` from Sprint 0 and appeared on
 * exactly nothing: not the login screen, not the sidebar, not the wizard. A
 * product whose own name is set in `ds-h4` and whose only picture is the
 * browser-tab favicon reads as an internal tool, which is what the owner saw.
 *
 * WHAT IT DRAWS. The **D** of DigiKhaato, drawn as a bahi-khata — the tall
 * cloth-bound ledger a kirana counter actually has on it. The letter and the
 * book are the same shape, and that coincidence is the mark:
 *
 *   · the letter's STEM is the khata's bound SPINE — the narrow bar on the
 *     left, stepped back a shade so the binding reads as behind the page;
 *   · the letter's BOWL is the PAGE it opens to — a rectangle closed by a
 *     half-circle, which is the D's counter and the book's fore-edge at once;
 *   · two RULES of different lengths lie on that page — the two columns every
 *     ledger in this market is ruled into, "diya" and "liya".
 *
 * There is no abstract second page stepping out behind any more. A letterform
 * has to survive at 24 px, and a fourth element at that size is a smudge; the
 * D is now legible as a D at the sidebar's `sm` tier, which is the size the
 * mark is seen at most.
 *
 * WHY IT IS INLINE SVG. `next/image` on a PNG costs a request and a layout
 * shift for a 24 px graphic, cannot inherit a colour, and cannot follow a
 * white-label ramp. The five fills below are `--brand-*` tokens derived from
 * `--primary-*` (§23.2.4), so a tenant that rewrites the primary ramp gets its
 * mark repainted with everything else, and no icon package is added (ADR-021).
 *
 * WHY IT DOES NOT INVERT. The mark is the same in both themes on purpose: the
 * tile carries its own contrast with the page inside it, so it needs no help
 * from the surface behind it, and a logo that changes colour with the theme is
 * two logos to maintain and recognise. Only the WORDMARK is theme-aware —
 * `--text-primary`, because it is type.
 *
 * ACCESSIBILITY. It is decorative by default (`aria-hidden`), which is right
 * everywhere it sits beside the product's name in text. Pass `label` where the
 * mark is the only thing naming the destination — the sidebar's home link, a
 * bare mark at the top of an auth screen — and it becomes `role="img"` with a
 * `<title>`. There is no third state: a graphic is either named or hidden.
 */
/** `fill` takes its parent's width — the auth hero's fascia sign. */
export type UbLogoSize = 'sm' | 'md' | 'lg' | 'xl' | 'fill';
export type UbLogoVariant = 'mark' | 'full';
/**
 * The wordmark's colour. `inherit` is for the dark navigation rail, which is
 * dark in BOTH themes (§23.2.4) and therefore does not follow `--text-primary`:
 * there the parent sets `--text-on-nav` and the wordmark takes it.
 */
export type UbLogoTone = 'primary' | 'inherit';

export interface UbLogoProps {
  /** `mark` is the tile alone; `full` sets the wordmark beside it. */
  readonly variant?: UbLogoVariant;
  readonly size?: UbLogoSize;
  /**
   * The name to set beside the mark. Defaults to `APP_NAME`; a screen inside a
   * white-labelled tenant passes `selectAppName` instead, because the design
   * system may not read Redux itself (§19.1.2).
   */
  readonly wordmark?: string;
  readonly tone?: UbLogoTone;
  /**
   * Accessible name. Omitted, the whole lockup is hidden from assistive
   * technology — correct wherever the name is already in the text beside it.
   */
  readonly label?: string;
  readonly className?: string;
}

/** Edge of the square tile, in px, per tier. */
const MARK_SIZE: Readonly<Record<UbLogoSize, string>> = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
  xl: 'h-12 w-12',
  fill: 'block h-auto w-full',
};

/**
 * The wordmark's type tier — `ds-wordmark-*`, registered by the typography
 * plugin (§23.2.2). It is a NAME, not a heading: borrowing `ds-h2` here would
 * put the product's name in the same tier as the page's title and leave two
 * things on the screen competing to be read first.
 */
const WORD_SIZE: Readonly<Record<UbLogoSize, string>> = {
  sm: 'ds-wordmark-sm',
  md: 'ds-wordmark-md',
  lg: 'ds-wordmark-lg',
  xl: 'ds-wordmark-xl',
  fill: 'ds-wordmark-xl',
};

const GAP: Readonly<Record<UbLogoSize, string>> = {
  sm: 'gap-2',
  md: 'gap-2.5',
  lg: 'gap-3',
  xl: 'gap-3',
  fill: 'gap-3',
};

function UbLogoBase({
  variant = 'mark',
  size = 'md',
  wordmark = APP_NAME,
  tone = 'primary',
  label,
  className,
}: Readonly<UbLogoProps>) {
  const named = typeof label === 'string' && label.length > 0;

  const mark = (
    <svg
      viewBox="0 0 64 64"
      className={cn(MARK_SIZE[size], 'shrink-0')}
      role={named && variant === 'mark' ? 'img' : undefined}
      aria-hidden={named && variant === 'mark' ? undefined : true}
      focusable="false"
    >
      {named && variant === 'mark' && <title>{label}</title>}
      {/* The tile. `rx` is the squircle radius of §23.2.3. */}
      <rect width="64" height="64" rx="15" className="fill-brand-mark" />
      {/* The bowl — the D's counter, and the page the khata opens to: a
          rectangle closed by a right half-circle centred on (31, 32). */}
      <path d="M20 16 h11 a16 16 0 0 1 0 32 h-11 z" className="fill-brand-page" />
      {/* The stem — the D's upright, and the khata's bound spine. It is drawn
          after the bowl so the binding laps the page's left edge. */}
      <rect x="14.5" y="16" width="5.5" height="32" rx="2.4" className="fill-brand-pageBack" />
      {/* The two ruled columns on that page, long and short. */}
      <rect x="27" y="26" width="13" height="3.6" rx="1.8" className="fill-brand-rule" />
      <rect x="27" y="34.5" width="7.5" height="3.6" rx="1.8" className="fill-brand-ruleShort" />
    </svg>
  );

  if (variant === 'mark') {
    return <span className={cn('inline-flex', className)}>{mark}</span>;
  }

  /**
   * The lockup is NOT hidden when it is unnamed: the wordmark is the product's
   * name as text, and hiding it would take the name off the screen for a screen
   * reader while leaving it there for everyone else. Only the graphic beside it
   * is decorative.
   */
  return (
    <span
      className={cn('inline-flex items-center', GAP[size], className)}
      role={named ? 'img' : undefined}
      aria-label={named ? label : undefined}
    >
      {mark}
      <span
        className={cn(
          'whitespace-nowrap',
          tone === 'primary' && 'text-text-primary',
          WORD_SIZE[size]
        )}
      >
        {wordmark}
      </span>
    </span>
  );
}

UbLogoBase.displayName = 'UbLogo';
export const UbLogo = memo(UbLogoBase);
