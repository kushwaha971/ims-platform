# nginx/conf.d/security-headers.inc — Part 29 §29.8.2's response headers, in ONE
# place. Included by the server block AND by every location that sets an
# add_header of its own: nginx gives such a location none of the server's
# headers, which is how every static asset used to go out without HSTS, nosniff
# or the CSP. `.inc`, not `.conf`, so the conf.d/*.conf glob in nginx.conf does
# not also load it at http level. Referrer-Policy is set per location (the share
# page's is no-referrer, everything else strict-origin-when-cross-origin).
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;                  # OEM embedding (P3) needs a per-partner CSP frame-ancestors
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=()" always;
# script-src needs 'unsafe-inline': Next.js starts every page with inline
# scripts (the RSC payload and the theme/locale boot scripts), and with
# `script-src 'self'` alone the login form never became usable — nobody could
# sign in (production-readiness audit, 9 Oct 2026; e2e/csp.mjs loads the app
# under this exact policy). External scripts are still refused.
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
