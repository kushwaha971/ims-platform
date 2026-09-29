import { FAQ_IDS, faqAnswerKey, faqQuestionKey } from '../config/faq';
import { LANDING_DESCRIPTION, LOGO_IMAGE } from '../config/seo';

import type { Pricing } from '../config/pricing';

/**
 * The landing page's structured data (CR-2026-09-29-PLATFORM-C), one
 * `@graph` so the four nodes can point at each other by `@id`:
 *
 *  - `Organization` — name, url, logo.
 *  - `WebSite` — the site, in both languages it is written in.
 *  - `SoftwareApplication` — a web app for businesses. Its `offers` are the
 *    FREE plan only while `pricing.status` is `'proposed'`: the paid figures
 *    are a proposal the owner has not approved and nothing is charged, and an
 *    `Offer` in structured data is a statement of a price anyone can pay
 *    today. Flipping the status to `'approved'` is what emits them.
 *  - `FAQPage` — built from the SAME ids (`config/faq.ts`) and the same English
 *    strings the FAQ section renders, so the markup can never describe an
 *    answer the page does not show.
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
}

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
}: LandingJsonLdInput): JsonLdNode => {
  const home = `${siteUrl}/`;
  const organizationId = `${home}#organization`;

  const plans =
    pricing.status === 'approved' ? pricing.plans : pricing.plans.filter((plan) => plan.monthly === 0);
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
        offers,
      },
      {
        '@type': 'FAQPage',
        '@id': `${home}#faq`,
        mainEntity: FAQ_IDS.map((id) => ({
          '@type': 'Question',
          name: message(messages, faqQuestionKey(id)),
          acceptedAnswer: { '@type': 'Answer', text: message(messages, faqAnswerKey(id)) },
        })),
      },
    ],
  };
};
