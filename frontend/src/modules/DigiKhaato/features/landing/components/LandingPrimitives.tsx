'use client';

import { memo, type ReactNode } from 'react';

import { UbBox, UbReveal, UbText } from 'src/design-system';
import { cn } from 'src/utils/cn';

/**
 * The landing page's own layout vocabulary — three pieces every section uses,
 * kept in one file so the rhythm (container, heading, eyebrow) is decided once.
 *
 * The container is `max-w-content` (1440) with the product's gutters. On 2K
 * and 4K screens the whole page is scaled instead (`LANDING_SCALE`, on the
 * page root), so type, spacing, frames and the container grow TOGETHER and a
 * 3840 screen does not show a small island in a sea of canvas.
 */
export const LANDING_CONTAINER = 'mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8';

/**
 * CSS `zoom` at the very wide end: 1.25 from 2400 px (a 2560 monitor lays out
 * like 2048), 1.6 from 3400 px (a 3840 one like 2400). One knob rather than
 * a `min-[2400px]:` bump on every size, which is how the first cut ended up
 * with a 4K hero at 1440-px proportions.
 */
export const LANDING_SCALE = 'min-[2400px]:[zoom:1.25] min-[3400px]:[zoom:1.6]';

/** The section rhythm: generous. */
export const LANDING_SECTION = 'relative py-16 md:py-20 xl:py-24';

/**
 * The italic-serif lead line: Fraunces italic, regular weight. Fraunces has no
 * Devanagari, and a browser's synthesised slant of Noto Sans Devanagari is a
 * typographic error rather than an italic (Devanagari has no italic
 * tradition), so in Hindi the line is upright, medium, in the secondary tone —
 * the contrast with the key line is carried by weight and colour instead.
 */
export const SERIF_LEAD =
  'block font-serif-display font-normal italic tracking-[-0.01em] [&:lang(hi)]:font-medium [&:lang(hi)]:not-italic [&:lang(hi)]:tracking-normal';

/** The bold-sans key line under it. */
export const SANS_KEY = 'block font-semibold tracking-[-0.025em]';

export function LandingEyebrow({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  return (
    <UbText
      as="span"
      variant="inherit"
      className="inline-flex items-center gap-2 rounded-pill border border-accent-line bg-accent-quiet px-3 py-1 ds-body-s-medium text-text-accent"
    >
      <UbBox as="span" aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </UbText>
  );
}

export interface LandingSectionHeadingProps {
  readonly id: string;
  readonly eyebrow: string;
  readonly lead: string;
  readonly keyLine: string;
  readonly align?: 'center' | 'start';
  readonly className?: string;
}

/** Eyebrow chip, then an italic-serif line over a bold-sans line, as one h2. */
function LandingSectionHeadingBase({
  id,
  eyebrow,
  lead,
  keyLine,
  align = 'center',
  className,
}: Readonly<LandingSectionHeadingProps>) {
  return (
    <UbReveal
      stagger
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className
      )}
    >
      <UbBox>
        <LandingEyebrow>{eyebrow}</LandingEyebrow>
      </UbBox>
      <UbText
        as="h2"
        id={id}
        variant="inherit"
        tone="primary"
        className="max-w-[30ch] text-balance text-[clamp(1.875rem,1.25rem+2.4vw,3rem)] leading-[1.12]"
      >
        <UbText as="span" variant="inherit" tone="secondary" className={SERIF_LEAD}>
          {lead}
        </UbText>{' '}
        <UbText as="span" variant="inherit" className={SANS_KEY}>
          {keyLine}
        </UbText>
      </UbText>
    </UbReveal>
  );
}

LandingSectionHeadingBase.displayName = 'LandingSectionHeading';
export const LandingSectionHeading = memo(LandingSectionHeadingBase);
