import { absoluteUrl, SITEMAP_PATHS } from 'src/utils/seo';

import type { MetadataRoute } from 'next';

/**
 * `/sitemap.xml` (CR-2026-09-29-PLATFORM-C): the five public pages, and only
 * those. No `lastModified`: a build date would claim every page changed on
 * every deploy, which is the signal search engines learn to ignore. No
 * per-locale entries: the language is a cookie, so there is one URL per page
 * (see docs/platform/STATUS.md, "i18n and SEO").
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.map((path) => ({ url: absoluteUrl(path) }));
}
