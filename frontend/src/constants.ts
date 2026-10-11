/**
 * Part 19 §19.14.1 — the ONLY file in the application that reads `process.env`.
 * `grep -r "process.env" src/ app/` returning anything else is a defect.
 *
 * Validation happens at module load so a missing variable fails loudly at boot
 * rather than as a mysterious 404 three screens later.
 */
import type { Locale } from 'src/types/domain.types';

const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing required env var ${name}. See .env.local.example.`);
  return value;
};

export const API_BASE_URL: string = required(
  'NEXT_PUBLIC_API_BASE_URL',
  process.env.NEXT_PUBLIC_API_BASE_URL
);

export const APP_NAME: string = process.env.NEXT_PUBLIC_APP_NAME ?? 'YourKhata';
export const DEFAULT_LOCALE: Locale = (process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en') as Locale;
export const IS_PRODUCTION: boolean = process.env.NEXT_PUBLIC_ENV === 'production';
export const SW_ENABLED: boolean = process.env.NEXT_PUBLIC_SW_ENABLED === 'true';
/**
 * On unless a build says `false` (owner, 11 Oct 2026: "analytics enable true").
 * It still needs a PostHog key to do anything, so the test stacks and a fresh
 * checkout, which have none, send nothing.
 */
export const ANALYTICS_ENABLED: boolean = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== 'false';
/**
 * DEC-017 — the PostHog project the build reports to. A PUBLIC key by design
 * (it is in the page of every PostHog customer); unset, analytics is off
 * whatever `ANALYTICS_ENABLED` says. See `src/analytics/`.
 */
export const POSTHOG_KEY: string = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '';
export const POSTHOG_HOST: string =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
/**
 * Session replay shows the words on the screen (owner, 11 Oct 2026: "I'm not
 * able to see the text … I want to see the text in recording"). Set
 * `NEXT_PUBLIC_POSTHOG_REPLAY_MASK_TEXT=true` to turn every word in a replay
 * back into asterisks. Whatever this says, what a person TYPES is never in a
 * replay, and clicks never carry text.
 */
export const POSTHOG_REPLAY_MASK_TEXT: boolean =
  process.env.NEXT_PUBLIC_POSTHOG_REPLAY_MASK_TEXT === 'true';
/** The dated set of SDK defaults PostHog's snippet names (`defaults:`). */
export const POSTHOG_DEFAULTS: string = process.env.NEXT_PUBLIC_POSTHOG_DEFAULTS || '2026-05-30';
export const COMMIT_SHA: string = process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'dev';

/**
 * CR-2026-09-29-PLATFORM-C — the public origin the site is KNOWN by: the
 * canonical link, `metadataBase` (so og:image is absolute), robots.txt's
 * `Sitemap:` line, every sitemap `<loc>` and the JSON-LD `url`s. One value, so a
 * staging deployment or a partner host changes it in one place (a build arg,
 * like every `NEXT_PUBLIC_*`). No trailing slash; paths are appended to it.
 *
 * It is deliberately NOT the address the request came in on: a canonical that
 * follows the Host header lets anyone who points a domain at the server tell
 * search engines that their domain is the original.
 */
export const SITE_URL: string = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://yourkhata.com'
).replace(/\/+$/, '');

/**
 * The landing page's narrated demo films: English and Hindi, each cut for the
 * desktop layout and for the phone layout (owner, 10–11 Oct 2026). The
 * defaults are the files under `public/media/landing/`; a deployment that
 * serves them from a CDN sets `NEXT_PUBLIC_DEMO_VIDEO_BASE_URL` to the folder
 * they are in (no trailing slash). The player shows a message and a sign-up
 * link when a file is not there, so a wrong value is a degraded page, not a
 * broken one.
 */
export const DEMO_VIDEO_BASE_URL: string = (
  process.env.NEXT_PUBLIC_DEMO_VIDEO_BASE_URL || '/media/landing'
).replace(/\/+$/, '');

/**
 * The same film on YouTube, one video id per cut (owner, 11 Oct 2026). Where a
 * cut has an id, pressing play loads YouTube's player for it instead of the
 * file above: YouTube adapts the quality to the connection and carries the
 * bandwidth. Where it has none, the file plays, exactly as before.
 *
 * The phone cut has NO default id on purpose: on the day these were set,
 * YouTube refused to describe that video to another site (oEmbed 403, which is
 * what "embedding off" or "not public" looks like), and a player that says
 * "Video unavailable" is worse than the file. Set
 * `NEXT_PUBLIC_DEMO_YOUTUBE_MOBILE=Js-xjsUXdYY` once it can be embedded. An
 * EMPTY value turns YouTube off for that cut.
 */
export const DEMO_YOUTUBE_DESKTOP: string =
  process.env.NEXT_PUBLIC_DEMO_YOUTUBE_DESKTOP ?? 'fk-hjhDi-tg';
export const DEMO_YOUTUBE_MOBILE: string = process.env.NEXT_PUBLIC_DEMO_YOUTUBE_MOBILE ?? '';

/**
 * Modules the public landing page does NOT show (owner, 10 Oct 2026: Gym and
 * Hotel are hidden for the coming deployment). Comma-separated module ids.
 *
 * This hides them from the landing page ONLY — cards, the module map, "Who
 * it's for", the FAQ's list, the page title and the structured data. No code,
 * table, API, route or permission is removed. To show them again, build with
 * `NEXT_PUBLIC_LANDING_HIDDEN_MODULES=` (empty), or change the default here.
 */
export const LANDING_HIDDEN_MODULES: readonly string[] = (
  process.env.NEXT_PUBLIC_LANDING_HIDDEN_MODULES ?? 'gym,hotel'
)
  .split(',')
  .map((id) => id.trim().toLowerCase())
  .filter(Boolean);

/** Money and quantity ceilings; strings, because money is a string end to end. */
export const MAX_AMOUNT = '99999999.99';
export const MAX_QTY = '9999999.999';

export const SEARCH_DEBOUNCE_MS = 300;
export const AUTOSAVE_DEBOUNCE_MS = 500;

/** Default tenant timezone until `/auth/me` says otherwise (ADR-011). */
export const DEFAULT_TENANT_TIMEZONE = 'Asia/Kolkata';

/** Request timeout; exports and uploads are the reason it is not lower. */
export const API_TIMEOUT_MS = 30_000;

/**
 * PLT-02 §10 / Part 27 §27.4.2 — the password floors the SERVER enforces
 * (`backend/apps/platform_app/services/passwords.py`), stated once so the
 * validator, the strength meter and the hint copy cannot drift apart.
 *
 * Eight characters for an ordinary member; TEN for anyone who holds `owner` or
 * `admin` anywhere. At MVP a self-registered account becomes the owner of the
 * business it creates, so ten is what every sign-up, set and reset screen
 * applies (CR-2026-09-19-A).
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MIN_LENGTH_PRIVILEGED = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** The longest address DRF's `EmailField` accepts. */
export const EMAIL_MAX_LENGTH = 254;

/**
 * Search-engine ownership tokens (owner, 11 Oct 2026). Google Search Console and
 * Bing Webmaster Tools each give a short code to put in a `<meta>` tag on the
 * home page; it proves the site is ours and is not a secret. Empty, no tag is
 * written. Verifying by a DNS record instead needs neither.
 */
export const GOOGLE_SITE_VERIFICATION: string =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? '';
export const BING_SITE_VERIFICATION: string = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ?? '';

/** Public delivery choice only; the API key stays on the server. */
export const OTP_USES_MINIMOTH = process.env.NEXT_PUBLIC_OTP_PROVIDER === 'minimoth';
export const AUTH_OTP_LENGTH: 4 | 6 = OTP_USES_MINIMOTH ? 6 : 4;
