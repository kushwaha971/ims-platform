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
 * WHAT IT DRAWS (CR-2026-09-29-BRAND-A, concept A of three in
 * `public/brand/concepts/`). The YourKhata mark: an OPEN KHATA on the indigo
 * tile, and the account on it settled.
 *
 *   · two white PAGES meeting at the spine, their top edges lifting the way a
 *     bound ledger's do when it lies open on a counter;
 *   · on the left page, two RULES of different lengths — the two columns every
 *     ledger in this market is ruled into, "diya" and "liya". They are the one
 *     soft element (`--brand-rule-soft`) and the first thing allowed to vanish
 *     at 16 px: the favicon has its own cut with a single rule;
 *   · on the right page, a bold TICK in the deep indigo (`--brand-rule`) — the
 *     khata squared, which is what the product is for. It is the element that
 *     has to survive every size, so it is a stroke of constant weight rather
 *     than a shape that thins as it scales.
 *
 * It replaces the DigiKhaato "spine D": the product is YourKhata now and a D
 * would be the wrong initial. It is deliberately not a letterform at all, so a
 * white-labelled tenant's name beside it never contradicts the picture.
 *
 * WHY IT IS INLINE SVG. `next/image` on a PNG costs a request and a layout
 * shift for a 24 px graphic, cannot inherit a colour, and cannot follow a
 * white-label ramp. The four colours below are `--brand-*` tokens derived from
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
      {/* The open khata: the left page, then the right, meeting at the spine. */}
      <path
        d="M9 20.5C15.5 17 23.5 17 30.5 20.5V47.5C23.5 44 15.5 44 9 47Z"
        className="fill-brand-page"
      />
      <path
        d="M33.5 20.5C40.5 17 48.5 17 55 20.5V47C48.5 44 40.5 44 33.5 47.5Z"
        className="fill-brand-page"
      />
      {/* The two ruled columns on the left page, long and short. */}
      <rect x="14" y="27" width="11.5" height="3.4" rx="1.7" className="fill-brand-ruleSoft" />
      <rect x="14" y="34" width="7.5" height="3.4" rx="1.7" className="fill-brand-ruleSoft" />
      {/* The tick on the right page: the account settled. */}
      <path
        d="M38.5 33.5L42.8 37.8L50.2 28.2"
        className="fill-none stroke-brand-rule"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
