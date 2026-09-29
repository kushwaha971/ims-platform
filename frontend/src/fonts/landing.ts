import localFont from 'next/font/local';

/**
 * Fraunces ITALIC — the landing page's lead lines ("One khata for your whole
 * shop."). The upright file in `src/fonts/index.ts` has no italic, and a
 * browser's synthesised oblique of a display serif is visibly a slanted
 * roman: the ascenders lean and the bowls do not change shape.
 *
 * Its own module, imported only by `app/page.tsx`, so the 45 KB file is
 * preloaded on `/` and on no other route. The weight axis only (100–900):
 * the SOFT/WONK axes of the upright file are not used on the landing page.
 * SIL OFL 1.1, from the same Fontsource 5.3.0 package as the upright file
 * (licence: OFL-Fraunces.txt).
 */
export const frauncesItalic = localFont({
  src: [{ path: './fraunces-latin-wght-italic.woff2', weight: '100 900', style: 'italic' }],
  variable: '--font-fraunces-italic',
  display: 'swap',
});
