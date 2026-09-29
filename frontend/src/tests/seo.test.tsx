import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, screen } from '@testing-library/react';


import { SITE_URL } from 'src/constants';
import { serializeJsonLd, UbDisclosure } from 'src/design-system';
import { APP_ROUTE_PREFIXES, GUARDED_ROUTE_PREFIXES, ROUTES } from 'src/routes';
import { LANDING_JARGON, PLANNED_MODULE_WORDS, withoutBrand } from 'src/tests/plannedModuleVocabulary';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import { CRAWL_DISALLOW, NOINDEX_ROBOTS, SITEMAP_PATHS } from 'src/utils/seo';

import { metadata as adminLayoutMetadata } from 'app/(admin)/layout';
import { metadata as appLayoutMetadata } from 'app/(app)/layout';
import { metadata as acceptInviteMetadata } from 'app/(auth)/accept-invite/layout';
import { metadata as onboardingMetadata } from 'app/(auth)/onboarding/layout';
import { metadata as resetMetadata } from 'app/(auth)/reset-password/layout';
import { metadata as shareMetadata } from 'app/(public)/d/[token]/page';
import { metadata as rootMetadata } from 'app/layout';
import { metadata as landingMetadata } from 'app/page';
import robots from 'app/robots';
import sitemap from 'app/sitemap';
import en from 'locales/catalogues/landing.en.json';

import { FaqSection } from 'modules/DigiKhaato/features/landing/components/LandingClosing';
import { FAQ_IDS, faqAnswerKey, faqQuestionKey } from 'modules/DigiKhaato/features/landing/config/faq';
import { PRICING, type Pricing } from 'modules/DigiKhaato/features/landing/config/pricing';
import {
  LANDING_DESCRIPTION,
  LANDING_SHARE_DESCRIPTION,
  LANDING_SHARE_TITLE,
  LANDING_TITLE,
  OG_IMAGE,
} from 'modules/DigiKhaato/features/landing/config/seo';
import { buildLandingJsonLd } from 'modules/DigiKhaato/features/landing/utils/landingJsonLd';

import type { Metadata } from 'next';

/**
 * CR-2026-09-29-PLATFORM-C — what the site tells search engines and link
 * previews. Every assertion here guards a statement the page makes to someone
 * who has not seen it yet: a result title, a crawl rule, a price in structured
 * data. None of it is visible on screen, so no component test would notice any
 * of it going wrong.
 */

const PUBLIC = join(process.cwd(), 'public');
const HOME = `${SITE_URL}/`;

describe('the landing page metadata', () => {
  /** A title over ~60 and a description over ~160 are cut off mid-word in a result. */
  it('has a title under 60 and a description under 160 characters', () => {
    expect(landingMetadata.title).toEqual({ absolute: LANDING_TITLE });
    expect(LANDING_TITLE.length).toBeLessThan(60);
    expect(landingMetadata.description).toBe(LANDING_DESCRIPTION);
    expect(LANDING_DESCRIPTION.length).toBeLessThan(160);
    expect(LANDING_TITLE).toMatch(/^YourKhata\b/);
  });

  /**
   * Vision §4 twice over: no jargon, and no planned module named in a search
   * result, where there is no "planned" chip beside it to say it is not built.
   */
  it.each([
    ['title', LANDING_TITLE],
    ['description', LANDING_DESCRIPTION],
    ['share title', LANDING_SHARE_TITLE],
    ['share description', LANDING_SHARE_DESCRIPTION],
    ['image alt', OG_IMAGE.alt],
    ['root description', String(rootMetadata.description)],
  ])('the %s carries no jargon and no planned module', (_, text) => {
    expect(withoutBrand(text)).not.toMatch(LANDING_JARGON.en);
    expect(text).not.toMatch(PLANNED_MODULE_WORDS.en);
    expect(text).not.toMatch(/\bplanned\b|coming soon/i);
  });

  it('is canonical at the configured origin, which defaults to yourkhata.com', () => {
    expect(SITE_URL).toBe('https://yourkhata.com');
    expect(landingMetadata.alternates?.canonical).toBe('https://yourkhata.com/');
    expect(String(rootMetadata.metadataBase)).toBe('https://yourkhata.com/');
  });

  it('is indexable, with large image previews allowed', () => {
    expect(landingMetadata.robots).toMatchObject({
      index: true,
      follow: true,
      googleBot: { 'max-image-preview': 'large' },
    });
  });

  it('has Open Graph and Twitter cards pointing at the 1200 × 630 card', () => {
    const og = landingMetadata.openGraph as NonNullable<Metadata['openGraph']> & { type?: string };
    expect(og).toMatchObject({
      type: 'website',
      url: HOME,
      siteName: 'YourKhata',
      title: LANDING_SHARE_TITLE,
      description: LANDING_SHARE_DESCRIPTION,
    });
    expect(og.images).toEqual([expect.objectContaining({ url: OG_IMAGE.url, width: 1200, height: 630 })]);
    expect(landingMetadata.twitter).toMatchObject({ card: 'summary_large_image', title: LANDING_SHARE_TITLE });
  });

  /** A preview card that 404s, or is not the size it claims, is cropped or dropped. */
  it('ships the card as a real 1200 × 630 PNG under /brand/', () => {
    const png = readFileSync(join(PUBLIC, OG_IMAGE.url));
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(OG_IMAGE.url.startsWith('/brand/')).toBe(true);
  });

  /**
   * The customer's bill must never carry the product's preview card or name
   * (CR-2026-09-29-BRAND-A). The card lives on `/`'s own metadata, not the root
   * layout's, precisely so that nothing inherits it.
   */
  it('keeps every card and the product name off the root layout and the share page', () => {
    expect(rootMetadata.openGraph).toBeUndefined();
    expect(rootMetadata.twitter).toBeUndefined();
    expect(shareMetadata.openGraph).toBeUndefined();
    expect(shareMetadata.robots).toMatchObject({ index: false, follow: false });
  });
});

describe('noindex on everything that is not public', () => {
  it.each([
    ['(app)', appLayoutMetadata],
    ['(admin)', adminLayoutMetadata],
    ['onboarding', onboardingMetadata],
    ['reset-password', resetMetadata],
    ['accept-invite', acceptInviteMetadata],
  ])('the %s layout says noindex, nofollow', (_, metadata) => {
    expect(metadata.robots).toBe(NOINDEX_ROBOTS);
    expect(NOINDEX_ROBOTS).toMatchObject({ index: false, follow: false });
  });
});

/** Longest-match, the way Google reads robots.txt (RFC 9309 §2.2.2). */
const allowed = (path: string, allow: readonly string[], disallow: readonly string[]): boolean => {
  const longest = (rules: readonly string[]) =>
    Math.max(-1, ...rules.filter((rule) => path.startsWith(rule)).map((rule) => rule.length));
  return longest(allow) >= longest(disallow);
};

describe('robots.txt', () => {
  const { rules, sitemap: sitemapUrl } = robots();
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const allow = [rule?.allow ?? []].flat();
  const disallow = [rule?.disallow ?? []].flat();

  it('applies to every crawler and names the sitemap', () => {
    expect(rule?.userAgent).toBe('*');
    expect(sitemapUrl).toBe('https://yourkhata.com/sitemap.xml');
  });

  /** The share page's token IS the credential: a customer's bill must never be crawled. */
  it('disallows the share pages with the slash, so /dashboard is not caught by accident', () => {
    expect(disallow).toContain('/d/');
    expect(disallow).not.toContain('/d');
    expect(allowed('/d/abc123', allow, disallow)).toBe(false);
  });

  it.each([
    '/dashboard',
    '/parties/42',
    '/sales/invoices/new',
    '/settings/team',
    '/admin/tenants',
    '/api/v1/auth/me',
    '/onboarding/step/2',
    '/reset-password?token=x',
    '/accept-invite/tok',
    '/forgot-password',
    '/set-password',
    '/design-system',
  ])('disallows %s', (path) => {
    expect(allowed(path, allow, disallow)).toBe(false);
  });

  /** A section added to the app is added to the guard; robots.txt follows it. */
  it('disallows every prefix the proxy guards', () => {
    for (const prefix of [...GUARDED_ROUTE_PREFIXES, ...APP_ROUTE_PREFIXES]) {
      expect(allowed(prefix, allow, disallow)).toBe(false);
    }
  });

  it.each(['/', '/legal/terms', '/legal/privacy', '/login', '/signup'])('allows %s', (path) => {
    expect(allowed(path, allow, disallow)).toBe(true);
  });
});

describe('sitemap.xml', () => {
  it('lists exactly the five public pages, absolute, at the configured origin', () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      'https://yourkhata.com/',
      'https://yourkhata.com/signup',
      'https://yourkhata.com/login',
      'https://yourkhata.com/legal/terms',
      'https://yourkhata.com/legal/privacy',
    ]);
  });

  /** A sitemap entry robots.txt forbids is a contradiction Search Console reports. */
  it('lists nothing robots.txt disallows', () => {
    for (const path of SITEMAP_PATHS) expect(allowed(path, [], CRAWL_DISALLOW)).toBe(true);
    expect(SITEMAP_PATHS).not.toContain(ROUTES.PUBLIC_DOCUMENT);
  });
});

describe('the landing page JSON-LD', () => {
  const build = (pricing: Pricing = PRICING) =>
    JSON.parse(serializeJsonLd(buildLandingJsonLd({ siteUrl: SITE_URL, appName: 'YourKhata', messages: en, pricing }))) as {
      '@context': string;
      '@graph': Record<string, unknown>[];
    };
  const node = (type: string, pricing?: Pricing) =>
    build(pricing)['@graph'].find((entry) => entry['@type'] === type) as Record<string, unknown>;

  const keysDeep = (value: unknown): string[] =>
    value && typeof value === 'object'
      ? Object.entries(value).flatMap(([k, v]) => [k, ...keysDeep(v)])
      : [];

  it('parses, and is a schema.org graph of the four nodes', () => {
    const data = build();
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@graph'].map((entry) => entry['@type'])).toEqual([
      'Organization',
      'WebSite',
      'SoftwareApplication',
      'FAQPage',
    ]);
  });

  /** Nobody has rated or reviewed the product; structured data saying so is invented. */
  it('carries no rating, review or other invented figure anywhere', () => {
    // Per key, anchored: `operatingSystem` contains the letters "rating".
    const invented = /^(aggregateRating|rating|ratingValue|ratingCount|bestRating|reviews?|reviewCount|interactionStatistic|userInteractionCount)$/i;
    expect(keysDeep(build()).filter((key) => invented.test(key))).toEqual([]);
    expect(JSON.stringify(build())).not.toMatch(/ratingValue|reviewCount|bestRating/);
  });

  it('describes the organisation and the site at the canonical origin', () => {
    expect(node('Organization')).toMatchObject({
      name: 'YourKhata',
      url: HOME,
      logo: { url: 'https://yourkhata.com/icons/icon-512.png', width: 512, height: 512 },
    });
    expect(node('WebSite')).toMatchObject({ name: 'YourKhata', url: HOME });
  });

  it('is a web business application', () => {
    expect(node('SoftwareApplication')).toMatchObject({
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: HOME,
    });
  });

  /**
   * The paid prices are a PROPOSAL (config/pricing.ts). An Offer in structured
   * data is a price anybody can pay today, and search engines show it as one.
   */
  it('offers the free plan only, at 0 INR, while pricing is proposed', () => {
    expect(PRICING.status).toBe('proposed');
    const offers = node('SoftwareApplication').offers as Record<string, unknown>[];
    expect(offers).toEqual([expect.objectContaining({ '@type': 'Offer', price: '0', priceCurrency: 'INR' })]);
    for (const plan of PRICING.plans.filter((p) => p.monthly > 0)) {
      expect(JSON.stringify(build())).not.toContain(`"${plan.monthly}"`);
    }
  });

  it('emits the paid plans the moment pricing is approved, and not before', () => {
    const offers = node('SoftwareApplication', { ...PRICING, status: 'approved' }).offers as Record<string, unknown>[];
    expect(offers.map((offer) => offer.price)).toEqual(PRICING.plans.map((plan) => String(plan.monthly)));
  });

  it('builds the FAQPage from the same questions and answers the page renders', () => {
    const faq = node('FAQPage').mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    const messages = en as Record<string, string>;
    expect(faq).toEqual(
      FAQ_IDS.map((id) => ({
        '@type': 'Question',
        name: messages[faqQuestionKey(id)],
        acceptedAnswer: { '@type': 'Answer', text: messages[faqAnswerKey(id)] },
      }))
    );
  });

  /** A `</script>` inside a string would end the element and spill the rest as markup. */
  it('escapes markup characters so it cannot close its own script element', () => {
    const out = serializeJsonLd({ text: '</script><b>&' });
    expect(out).not.toMatch(/[<>&]/);
    expect(JSON.parse(out)).toEqual({ text: '</script><b>&' });
  });
});

describe('the FAQ keeps its answers in the HTML', () => {
  /**
   * The answers were UNRENDERED while collapsed, so the server's HTML held
   * the ten questions and none of the answers — invisible to every crawler, and
   * the FAQPage markup would have described text the page did not contain.
   */
  it('renders every answer while closed, hidden, and shows it on open', () => {
    const { container } = renderWithProviders(<FaqSection />);
    const messages = en as Record<string, string>;
    for (const id of FAQ_IDS) expect(container.textContent).toContain(messages[faqAnswerKey(id)]);

    const trigger = screen.getByRole('button', { name: messages[faqQuestionKey('hindi')] });
    const panel = container.querySelector(`#${CSS.escape(trigger.getAttribute('aria-controls') ?? '')}`);
    expect(panel).toHaveAttribute('hidden');
    expect(panel).not.toHaveClass('flex');
    fireEvent.click(trigger);
    expect(panel).not.toHaveAttribute('hidden');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  /** A form's disclosure must stay unmounted: a hidden field in the tab order is a trap. */
  it('still unmounts a form disclosure by default', () => {
    renderWithProviders(
      <UbDisclosure label="More">
        <input aria-label="GSTIN" />
      </UbDisclosure>
    );
    expect(screen.queryByLabelText('GSTIN')).toBeNull();
  });
});

describe('cache headers for unhashed public assets', () => {
  /**
   * next.config.js serves them on every topology and nginx in production; the
   * two must say the same thing, or a browser caches differently depending on
   * which one answered.
   */
  it('are the same value in next.config.js and nginx, and never immutable', () => {
    const nextConfig = readFileSync(join(process.cwd(), 'next.config.js'), 'utf8');
    const nginx = readFileSync(join(process.cwd(), '../nginx/conf.d/app.conf'), 'utf8');
    const value = /PUBLIC_ASSET_CACHE = '([^']+)'/.exec(nextConfig)?.[1];
    expect(value).toBe('public, max-age=86400, stale-while-revalidate=604800');
    for (const prefix of ['/media/landing/', '/brand/']) {
      const block = nginx.slice(nginx.indexOf(`location ${prefix} {`));
      expect(block.slice(0, block.indexOf('}'))).toContain(`add_header Cache-Control "${value}" always;`);
    }
    expect(nextConfig).toContain("source: '/media/landing/:path*'");
    expect(nextConfig).toContain("source: '/brand/:path*'");
  });
});
