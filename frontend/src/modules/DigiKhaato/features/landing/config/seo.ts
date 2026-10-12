/** Owner, 12 Oct 2026: the title identifies a modular business-management platform.
 * Current module examples belong in descriptions and dedicated solution pages. */
/**
 * The landing page's words for search engines and link previews
 * (CR-2026-09-29-PLATFORM-C). They are not in the message catalogue because
 * there is one of each and crawlers do not send the locale cookie: what a
 * search result or a WhatsApp preview shows is the English page.
 *
 * Rules, each held by `seo.test.tsx`:
 *  - the title is under 60 characters and the description under 160, so
 *    neither is cut off in a result;
 *  - both describe the WHOLE platform, because the page presents every module
 *    as part of the product (CR-2026-09-29-PLATFORM-D). The title reaches all
 *    five in four words — bills (shop), fees (library, gym), collections
 *    (lending), bookings (hotel) — and the description names each one.
 *    Coaching & tuition was withdrawn by the owner on 29 Sep and is named
 *    nowhere. Plain words only: a result says "loan collections" and "room
 *    bookings", not the trade's shorthand;
 *  - no jargon ("kirana", English "udhaar" / "khata"), vision §4.
 *
 * Imports only the module table's flag, so a test can read it without a renderer.
 */
import { ALL_MODULES_VISIBLE } from './modules';

/**
 * The brand, as a literal. `APP_NAME` is the white-label FALLBACK a tenant's
 * branding replaces and is a build arg that has drifted before (compose once
 * defaulted it to the old name); what the product's own front page tells
 * search engines it is called must not depend on a deployment variable.
 */
export const BRAND_NAME = 'YourKhata';

/**
 * Two sets of words, chosen by which modules the page shows
 * (`LANDING_HIDDEN_MODULES`, owner 10 Oct 2026): a title or description that
 * names room bookings or gym members while the page shows neither is a claim
 * made only to search engines. `ALL` is the five-module wording; the default
 * names Shop, Library and Lending. Both keep the limits above.
 */
const WORDS = {
  shown: {
    title: 'YourKhata | Modular Business Management Software',
    description:
      'GST bills, stock and customer dues for shops; students, seats, fees and books for libraries; loans and daily collections for lenders. In Hindi or English.',
    shareTitle: 'YourKhata — one place for all your business records',
    shareDescription:
      'Shop bills and stock, library students, fees and books, and loan collections, on one shared core. Hindi or English.',
  },
  all: {
    title: 'YourKhata | Modular Business Management Software',
    description:
      'GST bills and stock, loan collections, library and gym members and their fees, and room bookings: all your records in one place, in Hindi or English.',
    shareTitle: 'YourKhata — one place for all your business records',
    shareDescription:
      'Shop bills and stock, loan collections, library and gym members, and room bookings, on one shared core. Hindi or English.',
  },
} as const;

export const landingWords = (allModules: boolean): (typeof WORDS)['shown' | 'all'] =>
  allModules ? WORDS.all : WORDS.shown;

const CURRENT = landingWords(ALL_MODULES_VISIBLE);

export const LANDING_TITLE: string = CURRENT.title;
export const LANDING_DESCRIPTION: string = CURRENT.description;
export const LANDING_SHARE_TITLE: string = CURRENT.shareTitle;
export const LANDING_SHARE_DESCRIPTION: string = CURRENT.shareDescription;

/**
 * The link-preview card: 1200 × 630, rendered from the brand SVGs and the hero
 * headline by `scripts/render-brand.mjs --og`. A static file rather than
 * `app/opengraph-image.tsx`, for two reasons measured against Next 16.3:
 *
 *  1. A file-convention OG image at the app root is merged into the ROOT
 *     segment's metadata and so inherited by every route that does not set its
 *     own — including `/d/<token>`, the customer's bill, which must never show
 *     the product (CR-2026-09-29-BRAND-A). A file referenced from this page's
 *     metadata alone cannot leak.
 *  2. `next/og` reads TTF/OTF/WOFF only; every brand face here is WOFF2, so the
 *     card would be set in its bundled fallback, not in Fraunces and DM Sans.
 *
 * Under `/brand/`, so it shares that prefix's cache policy (next.config.js,
 * nginx). Regenerate it when the headline or the mark changes.
 */
export { OG_IMAGE, LOGO_IMAGE } from './seoAssets';
