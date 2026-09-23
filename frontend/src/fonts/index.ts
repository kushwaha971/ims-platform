import localFont from 'next/font/local';

/**
 * The product typefaces, served from our own origin.
 *
 * DM Sans is what the BrandHub "Served" designs are drawn in, and the design
 * review measured the difference: the same screen set in the system fallback
 * (DejaVu on Linux, Segoe on Windows) came out wider and looser, and the
 * spacing complaints were partly the font. Noto Sans Devanagari carries the
 * Hindi, because DM Sans has no Devanagari glyphs and a browser's own fallback
 * for them varies by device.
 *
 * `next/font/local` rather than a stylesheet link: the files are in this
 * repository (SIL OFL 1.1 — licences beside them), so there is no request to a
 * font CDN at runtime or at build, and Next preloads and size-adjusts them so a
 * slow network does not reflow the page when they arrive.
 */
export const dmSans = localFont({
  src: [
    { path: './dm-sans-latin-wght-normal.woff2', weight: '100 1000', style: 'normal' },
    { path: './dm-sans-latin-ext-wght-normal.woff2', weight: '100 1000', style: 'normal' },
  ],
  variable: '--font-dm-sans',
  display: 'swap',
});

/** BrandHub's numeral face — prices, ids, quantities, dates (`ds-num-*`). */
export const inter = localFont({
  src: [{ path: './inter-latin-wght-normal.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-inter',
  display: 'swap',
});

/**
 * The auth hero's display pair (Figma "Now that's a Served Club"): Fraunces
 * Bold with `"SOFT" 0, "WONK" 1`, and Epilogue for the line under it. Used on
 * the sign-in panel only, so neither is preloaded on app routes.
 */
export const fraunces = localFont({
  src: [{ path: './fraunces-latin-full-normal.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-fraunces',
  display: 'swap',
  preload: false,
});

export const epilogue = localFont({
  src: [{ path: './epilogue-latin-400-normal.woff2', weight: '400', style: 'normal' }],
  variable: '--font-epilogue',
  display: 'swap',
  preload: false,
});

export const notoDevanagari = localFont({
  src: [
    { path: './noto-sans-devanagari-devanagari-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './noto-sans-devanagari-devanagari-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './noto-sans-devanagari-devanagari-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-noto-devanagari',
  display: 'swap',
  // The Latin half of a page never needs these; only preload for Hindi.
  preload: false,
});
