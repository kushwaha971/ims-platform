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
 * WHAT IT DRAWS (CR-2026-09-29-BRAND-C, K-c "Bandhan" from the third round in
 * `public/brand/concepts3/`). The YourKhata mark is a TIED BAHI COVER:
 *
 *   · the tile is the cloth COVER of a bahi-khata, in the deep indigo
 *     (`--brand-cover`, primary-600), with a stitched HEM inset along its edge
 *     (`--brand-hem`, primary-400, decorative);
 *   · on it, a white K — the round-1 "signature K", DM Sans 600 — whose leg
 *     does not stop at the baseline but sweeps on across the whole cover as
 *     the TIE BAND (`--brand-figure`), the string a bahi is bound shut with;
 *   · where the band is tied, a bahi-red KNOT (`--brand-knot`) with two white
 *     string ends hanging from it. It is the one raw colour the mark carries
 *     and it is never text: it sits too near the debit red to mean anything.
 *
 * SMALL SIZES. At 24 px and below (`size="sm"`) the hem is dropped and the
 * knot is a single dot, because a 1.5-unit stroke and two string ends are
 * 0.6 px there and read as noise. The favicon has its own hand-cut 16 px file
 * (`public/brand/yourkhata-mark-16.svg`) on the pixel grid.
 *
 * WHY A K IS WHITE-LABEL SAFE. Round 1 chose a picture over a letter so a
 * tenant's name beside it could never be contradicted. That concern is met a
 * different way: a tenant with its OWN logo replaces this mark wholesale
 * (`branding.logo_attachment_id`, §19.8.3), and a tenant without one is, by
 * definition, showing the product's default — YourKhata's K. And the
 * signature treatment of the wordmark (an indigo K whose sweep ends in the
 * knot) is applied only to the product's own name, never to a tenant's.
 *
 * WHY IT IS INLINE SVG. `next/image` on a PNG costs a request and a layout
 * shift for a 24 px graphic, cannot inherit a colour, and cannot follow a
 * white-label ramp. The colours are `--brand-*` tokens derived from
 * `--primary-*` (§23.2.4), so a tenant that rewrites the primary ramp gets its
 * mark repainted with everything else, and no icon package is added (ADR-021).
 * There is no clipPath and no `id` anywhere in it: two logos on one page (the
 * rail and the phone drawer) would otherwise share, and fight over, an id.
 *
 * WHY IT DOES NOT INVERT. The mark is the same in both themes on purpose: the
 * cover carries its own contrast with the K on it, so it needs no help from
 * the surface behind it, and a logo that changes colour with the theme is two
 * logos to maintain and recognise. Only the WORDMARK is theme-aware —
 * `--text-primary`, because it is type — and with it the knot token, whose
 * dot ends the wordmark's sweep on the theme's own surface.
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

/**
 * The K and the tie band on the 64 grid, flattened from the DM Sans 600 K of
 * `concepts3/k-c-mark.svg` (translate 10.6 38.5, scale 0.04) and trimmed at the
 * tile's edge — the band runs x 0 → 64 at y 41.9 → 46.4, which is inside the
 * straight part of the squircle, so it needs no clip.
 */
const FIGURE =
  'M13.43 38.5V10.5H18.23V22.05L28.82 10.5H34.77L24.43 21.61L34.52 37.7Q37.16 41.9 41.4 41.9H64V46.38H38.6Q34 46.38 30.6 40.9L21.01 25.32L18.23 28.29V38.5ZM0 41.9H20V46.38H0Z';

/**
 * The wordmark's signature K, in DM Sans font units (y up): the K whose leg
 * sweeps under "hata" and stops short of the knot, which is drawn at the end
 * of the ink of the final "a" — the same geometry as `yourkhata-lockup.svg`,
 * where the knot sits in a white ring; here the ring is a gap in the sweep,
 * because the wordmark does not know what surface it is on.
 */
const SIGNATURE_K =
  'M70.86 0V700H190.86V411.14L455.55 700H604.18L345.83 422.24L598 20Q664 -85 770 -85H2546V-197H700Q585 -197 500 -60L260.17 329.52L190.86 255.21V0Z';

/** Only the product's own name carries the signature K — never a tenant's. */
const PRODUCT_WORDMARK = 'YourKhata';

function UbLogoBase({
  variant = 'mark',
  size = 'md',
  wordmark = APP_NAME,
  tone = 'primary',
  label,
  className,
}: Readonly<UbLogoProps>) {
  const named = typeof label === 'string' && label.length > 0;
  const detailed = size !== 'sm';

  const mark = (
    <svg
      viewBox="0 0 64 64"
      className={cn(MARK_SIZE[size], 'shrink-0')}
      role={named && variant === 'mark' ? 'img' : undefined}
      aria-hidden={named && variant === 'mark' ? undefined : true}
      focusable="false"
    >
      {named && variant === 'mark' && <title>{label}</title>}
      {/* The cover. `rx` is the squircle radius of §23.2.3. */}
      <rect width="64" height="64" rx="15" className="fill-brand-cover" />
      {detailed && (
        <rect
          x="4.75"
          y="4.75"
          width="54.5"
          height="54.5"
          rx="11"
          className="fill-none stroke-brand-hem"
          strokeWidth="1.5"
        />
      )}
      {/* The K, its leg sweeping on as the tie band, and the band's left end. */}
      <path d={FIGURE} className="fill-brand-figure" />
      {detailed ? (
        <>
          <path
            d="M48 46L45 55M48 46L52 55"
            className="fill-none stroke-brand-figure"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* A ring of cover between the band and the knot, so the red reads as tied ON. */}
          <circle cx="48" cy="44.1" r="4.6" className="fill-brand-cover" />
          <circle cx="48" cy="44.1" r="3.2" className="fill-brand-knot" />
        </>
      ) : (
        <circle cx="48" cy="44.1" r="4" className="fill-brand-knot" />
      )}
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
        {wordmark === PRODUCT_WORDMARK ? <SignatureWordmark /> : wordmark}
      </span>
    </span>
  );
}

/**
 * "YourKhata" with the lockup's signature: the K in the accent, its sweep
 * running under "hata" into the knot. The name stays ONE text node for a
 * screen reader (and for `getByText`); the drawn version beside it is hidden.
 * The K is an inline SVG sized in `em`, so it scales with the wordmark tier
 * and sits on the text's baseline (`-0.197em` is the sweep's depth below it).
 */
function SignatureWordmark() {
  return (
    <>
      <span className="sr-only">{PRODUCT_WORDMARK}</span>
      <span aria-hidden="true">
        Your
        <svg
          viewBox="0 -700 623 897"
          className="inline-block h-[0.897em] w-[0.623em] overflow-visible align-[-0.197em] text-text-accent"
          focusable="false"
        >
          <g transform="scale(1 -1)">
            <path d={SIGNATURE_K} className="fill-current" />
            <circle cx="2638" cy="-141" r="62" className="fill-brand-knot" />
          </g>
        </svg>
        hata
      </span>
    </>
  );
}

UbLogoBase.displayName = 'UbLogo';
export const UbLogo = memo(UbLogoBase);
