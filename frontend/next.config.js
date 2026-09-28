/**
 * Part 19 §19.14.2 — same-origin API by proxy, never by CORS relaxation.
 * `output: 'standalone'` is what keeps the production image small enough for
 * the single-VPS deployment target of ADR-019.
 *
 * @type {import('next').NextConfig}
 */
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
        ],
      },
    ];
  },
};

module.exports = nextConfig;
