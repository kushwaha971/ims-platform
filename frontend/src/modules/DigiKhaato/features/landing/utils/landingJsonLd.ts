import { PUBLIC_PHONE, PUBLIC_SOCIAL_PROFILES } from '../config/contact';
import { faqAnswerKey, faqIds, faqQuestionKey } from '../config/faq';
import { LANDING_DESCRIPTION, LOGO_IMAGE } from '../config/seo';

import type { Pricing } from '../config/pricing';

/**
 * The landing page's structured data (CR-2026-09-29-PLATFORM-C), one
 * `@graph` so the four nodes can point at each other by `@id`:
 *
 *  - `Organization` — name, url, logo.
 *  - `WebSite` — the site, in both languages it is written in.
 *  - `SoftwareApplication` — a web app for businesses. While pricing is hidden
 *    (`showPricing` false, CR-2026-09-29-PLATFORM-D) it has NO `offers` key at
 *    all: a price in structured data the page does not show is a claim made
 *    only to search engines. With pricing shown, `offers` is the FREE plan
 *    only while `pricing.status` is `'proposed'` — an `Offer` is a price
 *    anyone can pay today — and every plan once it is `'approved'`.
 *  - `VideoObject` — one per narrated demo film, ONLY when the caller passes
 *    them: Google requires `name`, `thumbnailUrl`, `uploadDate` and a content
 *    or embed URL, and asks that the video be on the page that declares it
 *    (Search Central, "Video structured data"). The demo section renders both
 *    films, their transcripts are in the HTML, and the dates and durations
 *    come from `config/demoTranscript.ts`, which the films are built from.
 *  - `FAQPage` — built from the SAME ids (`config/faq.ts`, for the same flag)
 *    and the same English strings the FAQ section renders, so the markup can
 *    never describe an answer the page does not show.
 *
 * What it deliberately never carries: `aggregateRating`, `review`, a user
 * count or any other figure nobody has measured. `seo.test.ts` walks the whole
 * graph for them.
 *
 * Pure: the caller passes the origin and the messages, so a test builds the
 * exact object the page serialises.
 */
export type JsonLdNode = Readonly<Record<string, unknown>>;

export interface LandingJsonLdInput {
  /** `SITE_URL` — no trailing slash. */
  readonly siteUrl: string;
  readonly appName: string;
  /** The English landing catalogue: `landing.faq.<id>.{q,a}` at least. */
  readonly messages: Readonly<Record<string, string>>;
  readonly pricing: Pricing;
  /** `SHOW_PRICING`, passed in so a test can build both states. */
  readonly showPricing: boolean;
  /** `ALL_MODULES_VISIBLE` — which "Which modules are there?" answer the page renders. */
  readonly allModules?: boolean;
  /** The module names the page shows, in order — `SoftwareApplication.featureList`. */
  readonly moduleNames?: readonly string[];
  /** The narrated demo films on the page; omitted, no `VideoObject` is emitted. */
  readonly videos?: readonly LandingVideo[];
}

export interface LandingVideo {
  readonly language: 'en' | 'hi';
  readonly name: string;
  readonly description: string;
  /** Site-relative or absolute. */
  readonly contentUrl: string;
  readonly thumbnailUrl: string;
  /** The same film's player elsewhere (YouTube), when it is published there. */
  readonly embedUrl?: string;
  /** ISO 8601 date the film was published. */
  readonly uploadDate: string;
  /** Whole seconds. */
  readonly durationSeconds: number;
  /** The full narration, as plain text. */
  readonly transcript: string;
}

const absolute = (siteUrl: string, url: string): string =>
  /^https?:\/\//.test(url) ? url : `${siteUrl}${url}`;

/** `185` → `PT3M5S`. */
export const isoDuration = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `PT${minutes ? `${minutes}M` : ''}${whole % 60}S`;
};

const message = (messages: Readonly<Record<string, string>>, key: string): string => {
  const value = messages[key];
  if (!value) throw new Error(`landing JSON-LD: no message "${key}"`);
  return value;
};

export const buildLandingJsonLd = ({
  siteUrl,
  appName,
  messages,
  pricing,
  showPricing,
  allModules = false,
  moduleNames = [],
  videos = [],
}: LandingJsonLdInput): JsonLdNode => {
  const home = `${siteUrl}/`;
  const organizationId = `${home}#organization`;

  const plans =
    pricing.status === 'approved'
      ? pricing.plans
      : pricing.plans.filter((plan) => plan.monthly === 0);
  const offers = plans.map((plan) => ({
    '@type': 'Offer',
    name: plan.id === 'free' ? 'Free' : plan.id.charAt(0).toUpperCase() + plan.id.slice(1),
    price: String(plan.monthly),
    priceCurrency: pricing.currency,
    ...(plan.monthly > 0
      ? {
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: String(plan.monthly),
            priceCurrency: pricing.currency,
            unitCode: 'MON',
            valueAddedTaxIncluded: false,
          },
        }
      : {}),
    url: `${home}#pricing`,
  }));

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: appName,
        url: home,
        telephone: PUBLIC_PHONE,
        sameAs: PUBLIC_SOCIAL_PROFILES,
        logo: {
          '@type': 'ImageObject',
          url: `${siteUrl}${LOGO_IMAGE.url}`,
          width: LOGO_IMAGE.width,
          height: LOGO_IMAGE.height,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${home}#website`,
        name: appName,
        url: home,
        inLanguage: ['en', 'hi'],
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${home}#app`,
        name: appName,
        url: home,
        description: LANDING_DESCRIPTION,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: ['en', 'hi'],
        publisher: { '@id': organizationId },
        ...(moduleNames.length ? { featureList: [...moduleNames] } : {}),
        ...(showPricing ? { offers } : {}),
      },
      ...videos.map((video) => ({
        '@type': 'VideoObject',
        '@id': `${home}#demo-${video.language}`,
        name: video.name,
        description: video.description,
        thumbnailUrl: [absolute(siteUrl, video.thumbnailUrl)],
        contentUrl: absolute(siteUrl, video.contentUrl),
        ...(video.embedUrl ? { embedUrl: video.embedUrl } : {}),
        uploadDate: video.uploadDate,
        duration: isoDuration(video.durationSeconds),
        inLanguage: video.language,
        transcript: video.transcript,
        publisher: { '@id': organizationId },
      })),
      {
        '@type': 'FAQPage',
        '@id': `${home}#faq`,
        mainEntity: faqIds(showPricing).map((id) => ({
          '@type': 'Question',
          name: message(messages, faqQuestionKey(id)),
          acceptedAnswer: {
            '@type': 'Answer',
            text: message(messages, faqAnswerKey(id, allModules)),
          },
        })),
      },
    ],
  };
};
