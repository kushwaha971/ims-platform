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
 * Imports nothing, so a test can read it without a renderer.
 */
/**
 * The brand, as a literal. `APP_NAME` is the white-label FALLBACK a tenant's
 * branding replaces and is a build arg that has drifted before (compose once
 * defaulted it to the old name); what the product's own front page tells
 * search engines it is called must not depend on a deployment variable.
 */
export const BRAND_NAME = 'YourKhata';

export const LANDING_TITLE = 'YourKhata: bills, fees, collections and bookings in one app';

export const LANDING_DESCRIPTION =
  'GST bills and stock, loan collections, library and gym members and their fees, and room bookings: all your records in one place, in Hindi or English.';

export const LANDING_SHARE_TITLE = 'YourKhata — one place for all your business records';

export const LANDING_SHARE_DESCRIPTION =
  'Shop bills and stock, loan collections, library and gym members, and room bookings, on one shared core. Hindi or English.';

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
export const OG_IMAGE = {
  url: '/brand/yourkhata-og.png',
  width: 1200,
  height: 630,
  alt: 'YourKhata — All your records, in one place.',
  type: 'image/png',
} as const;

/** The mark as a square raster, for `Organization.logo` (Google asks for ≥ 112 px). */
export const LOGO_IMAGE = { url: '/icons/icon-512.png', width: 512, height: 512 } as const;
