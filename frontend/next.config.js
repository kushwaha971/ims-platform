/**
 * Part 19 §19.14.2 — same-origin API by proxy, never by CORS relaxation.
 * `output: 'standalone'` is what keeps the production image small enough for
 * the single-VPS deployment target of ADR-019.
 *
 * @type {import('next').NextConfig}
 */
/** Cache policy for unhashed public assets — see `headers()` below. */
const PUBLIC_ASSET_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  /**
   * W4-P (28 Sep 2026) — one tailwind-merge and one clsx, not two.
   *
   * `vendor/ml-uikit` ships its own `node_modules` with tailwind-merge 1.14 and
   * clsx 1.2 for its internal `cn()`, so every route that renders an ml-uikit
   * component downloaded a second copy of both next to the app's 2.6 / 2.1 —
   * ~6.7 KB gz on every `(app)` route, measured. Aliasing the two bare names
   * makes every importer, the vendored package included, resolve the app's.
   *
   * Safe because ml-uikit only ever calls `twMerge(clsx(inputs))`, whose
   * contract did not change between the majors. What DID change is which
   * classes tailwind-merge knows: 2.x understands Tailwind 3.3/3.4's `size-*`,
   * `text-balance` and `line-clamp-*`, so a later `size-5` now removes an
   * earlier `h-4 w-4` (the caller wins, as `cn()` promises) where 1.14 kept
   * both and let stylesheet order decide, and `text-balance` no longer deletes
   * the text colour beside it. A merge of every ml-uikit class string against
   * every other and against every design-system class string found no other
   * kind of difference. jest maps the same two names (jest.config.ts), so the
   * component tests merge classes the way the build does.
   */
  turbopack: {
    resolveAlias: {
      'tailwind-merge': './node_modules/tailwind-merge/dist/bundle-mjs.mjs',
      clsx: './node_modules/clsx/dist/clsx.mjs',
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  async rewrites() {
    return process.env.API_PROXY_TARGET
      ? [
          {
            source: '/api/:path*',
            destination: `${process.env.API_PROXY_TARGET}/api/:path*`,
          },
        ]
      : [];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // camera=(self) because the invoice/entry photo capture uses it.
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      /**
       * Part 27 §27.12 / Sprint 12 — the customer's share page. The token in
       * the path IS the credential: never indexed, never cached, never sent
       * onward in a Referer. Listed after the catch-all so its Referrer-Policy
       * overrides the one above (Next: the last matching key wins). nginx sets
       * the same on /d/ in production; this covers every other topology.
       */
      /**
       * CR-2026-09-29-PLATFORM-C — the landing page's recordings and posters,
       * and the brand files (favicon SVG, the link-preview card). Without this
       * Next serves `public/` with `max-age=0`, so every repeat visit
       * revalidated ~2 MB of posters and loops before the hero could paint.
       *
       * NOT `max-age=31536000, immutable`, because these names are not hashed:
       * `hero-desktop.webm` is re-cut under the same name (it is being re-cut
       * as this is written), and an immutable year would pin the old cut in
       * every returning browser with no way to evict it. A day fresh, then a
       * week in which the cached copy is served at once while it revalidates
       * in the background: a repeat visit never waits, and a re-cut reaches
       * everybody within a day. Versioned URLs (a `?v=` from the manifest)
       * would earn `immutable` and are in docs/BACKLOG.md. nginx sets the same
       * value for production (nginx/conf.d/app.conf); `e2e/seo.mjs` checks it.
       */
      {
        source: '/media/landing/:path*',
        headers: [{ key: 'Cache-Control', value: PUBLIC_ASSET_CACHE }],
      },
      {
        source: '/brand/:path*',
        headers: [{ key: 'Cache-Control', value: PUBLIC_ASSET_CACHE }],
      },
      {
        source: '/d/:token*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
