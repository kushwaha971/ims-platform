import { absoluteUrl, CRAWL_ALLOW, CRAWL_DISALLOW } from 'src/utils/seo';

import type { MetadataRoute } from 'next';

/**
 * `/robots.txt` (CR-2026-09-29-PLATFORM-C). The lists and the reason for each
 * entry are in `src/utils/seo.ts`; `seo.test.ts` asserts the share page, the
 * app, the console and the API are all disallowed.
 *
 * `/d/` is disallowed AND answers `noindex` (the page's meta, next.config's
 * `X-Robots-Tag`, nginx's copy). The two are not redundant: the disallow keeps
 * a well-behaved crawler from ever fetching a customer's bill, and the noindex
 * is what a crawler that fetched it anyway — or one that ignores robots.txt —
 * is told. A disallowed URL can still be LISTED, bare, if somebody links to it
 * publicly; that residue is recorded in docs/BACKLOG.md.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: [...CRAWL_ALLOW],
      disallow: [...CRAWL_DISALLOW],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
