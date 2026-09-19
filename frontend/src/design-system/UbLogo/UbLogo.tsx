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
 * WHAT IT DRAWS. An abstract bahi-khata — the tall cloth-bound ledger a kirana
 * counter actually has on it:
 *
 *   · the SPINE, the narrow bar on the left;
 *   · the FRONT PAGE, the panel it opens to;
 *   · one more PAGE stepping out behind it, because a khata is many pages and a
 *     single rectangle is a card, not a book;
 *   · two RULES of different lengths on the front page — the two columns every
 *     ledger in this market is ruled into, "diya" and "liya".
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
export type UbLogoSize = 'sm' | 'md' | 'lg' | 'xl';
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
};

const GAP: Readonly<Record<UbLogoSize, string>> = {
  sm: 'gap-2',
  md: 'gap-2.5',
  lg: 'gap-3',
  xl: 'gap-3',
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
      viewBox="0 0 48 48"
      className={cn(MARK_SIZE[size], 'shrink-0')}
      role={named && variant === 'mark' ? 'img' : undefined}
      aria-hidden={named && variant === 'mark' ? undefined : true}
      focusable="false"
    >
      {named && variant === 'mark' && <title>{label}</title>}
      {/* The tile. `rx` is 25 % of the edge — the squircle radius of §23.2.3. */}
      <rect width="48" height="48" rx="12" className="fill-brand-mark" />
      {/* The page stepping out behind, drawn first so the front page laps it. */}
      <rect x="29.5" y="13" width="9.5" height="22" rx="3" className="fill-brand-pageBack" />
      {/* The spine. */}
      <rect x="10.5" y="10" width="5.5" height="28" rx="2.75" className="fill-brand-page" />
      {/* The front page. */}
      <rect x="18.5" y="10" width="15" height="28" rx="3" className="fill-brand-page" />
      {/* The two ruled columns, long and short. */}
      <rect x="21" y="18.5" width="10.5" height="3.2" rx="1.6" className="fill-brand-rule" />
      <rect x="21" y="25.5" width="5.75" height="3.2" rx="1.6" className="fill-brand-ruleShort" />
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
