import { SITE_URL } from 'src/constants';
import { UbJsonLd } from 'src/design-system';
import { frauncesItalic } from 'src/fonts/landing';
import { absoluteUrl } from 'src/utils/seo';

import en from 'locales/catalogues/landing.en.json';

import { LandingPage } from 'modules/DigiKhaato/features/landing/components/LandingPage';
import {
  DEMO_PUBLISHED_ON,
  DEMO_TRANSCRIPT,
} from 'modules/DigiKhaato/features/landing/config/demoTranscript';
import {
  DEMO_FILMS,
  DEMO_VOICE,
  demoVideoUrl,
} from 'modules/DigiKhaato/features/landing/config/media';
import {
  ALL_MODULES_VISIBLE,
  VISIBLE_MODULES,
} from 'modules/DigiKhaato/features/landing/config/modules';
import { PRICING, SHOW_PRICING } from 'modules/DigiKhaato/features/landing/config/pricing';
import {
  BRAND_NAME,
  LANDING_DESCRIPTION,
  LANDING_SHARE_DESCRIPTION,
  LANDING_SHARE_TITLE,
  LANDING_TITLE,
  OG_IMAGE,
} from 'modules/DigiKhaato/features/landing/config/seo';
import { buildLandingJsonLd } from 'modules/DigiKhaato/features/landing/utils/landingJsonLd';

import type { Metadata } from 'next';

/**
 * The front door, `/`: the public landing page.
 *
 * It renders for a visitor with NO session cookie only. A browser carrying one
 * is redirected to the dashboard by `proxy.ts` before this file runs, which is
 * where that rule lives — beside the session guard, in one place (Part 19
 * §19.7.3) — so this page knows nothing about sessions and reads none.
 *
 * It is outside every route group on purpose. `(public)` is the SHOP's space —
 * the `/d/<token>` share page and the legal pages a customer may open — and its
 * layout promises that nothing on it names the product
 * (`customerDocumentsCarryNoProductName.test.tsx`); this page is the product
 * naming itself.
 *
 * `frauncesItalic.variable` is applied here so the italic face is preloaded on
 * this route alone (src/fonts/landing.ts).
 *
 * CR-2026-09-29-PLATFORM-C — search. The words are in `config/seo.ts` (and the
 * rules they follow); the canonical and every absolute URL come from
 * `SITE_URL`; the link-preview card is a static PNG referenced from HERE only,
 * for the reason `OG_IMAGE` records. The Open Graph and Twitter blocks are on
 * this page and not in the root layout, so no other route inherits a card that
 * names the product — the customer's `/d/<token>` above all.
 */
export const metadata: Metadata = {
  title: { absolute: LANDING_TITLE },
  description: LANDING_DESCRIPTION,
  alternates: { canonical: absoluteUrl('/') },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: absoluteUrl('/'),
    siteName: BRAND_NAME,
    locale: 'en_IN',
    title: LANDING_SHARE_TITLE,
    description: LANDING_SHARE_DESCRIPTION,
    images: [{ ...OG_IMAGE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: LANDING_SHARE_TITLE,
    description: LANDING_SHARE_DESCRIPTION,
    images: [
      { url: OG_IMAGE.url, alt: OG_IMAGE.alt, width: OG_IMAGE.width, height: OG_IMAGE.height },
    ],
  },
};

/**
 * Structured data is built here, on the server, from the English catalogue:
 * crawlers send no locale cookie, so the English page is the one indexed, and
 * the FAQ markup quotes the answers the English page renders.
 */
const JSON_LD = buildLandingJsonLd({
  siteUrl: SITE_URL,
  appName: BRAND_NAME,
  messages: en,
  pricing: PRICING,
  showPricing: SHOW_PRICING,
  allModules: ALL_MODULES_VISIBLE,
  moduleNames: VISIBLE_MODULES.map(
    (module) => en[`landing.module.${module.id}.name` as keyof typeof en]
  ),
  // The narrated demo film is on this page (the #demo section), with its
  // transcript in the HTML, which is what lets it be declared here. ONE film,
  // in the language it is spoken in: the English words on the page are its
  // subtitles, not a second film, so they are not declared as one. The desktop
  // cut is the one declared: the phone cut is the same film in another shape,
  // and declaring both would be a duplicate.
  videos: [
    {
      language: DEMO_VOICE,
      name: DEMO_TRANSCRIPT[DEMO_VOICE].name,
      description: DEMO_TRANSCRIPT[DEMO_VOICE].description,
      contentUrl: demoVideoUrl(DEMO_FILMS.desktop.id),
      thumbnailUrl: DEMO_FILMS.desktop.poster.jpg,
      // Google asks for a date WITH a timezone; the film is cut in India.
      uploadDate: `${DEMO_PUBLISHED_ON}T00:00:00+05:30`,
      durationSeconds: DEMO_TRANSCRIPT[DEMO_VOICE].cuts.desktop.durationSeconds,
      transcript: DEMO_TRANSCRIPT[DEMO_VOICE].chapters
        .flatMap((chapter) => chapter.paragraphs)
        .join(' '),
    },
  ],
});

export default function HomePage(): React.JSX.Element {
  return (
    <>
      <UbJsonLd data={JSON_LD} data-testid="landing-jsonld" />
      <LandingPage className={frauncesItalic.variable} />
    </>
  );
}
