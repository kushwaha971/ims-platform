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
