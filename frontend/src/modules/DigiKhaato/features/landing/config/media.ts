/**
 * The landing page's recordings, typed. The source of truth is
 * `public/media/landing/manifest.json` (dimensions, codecs, durations); this
 * file restates only what a `<video>` needs, so the page does not ship the
 * whole manifest to read eight numbers — and `landingMedia.test.ts` fails if
 * the two ever disagree about a size, a codec or a file that exists.
 *
 * Alt text lives in the message catalogue (`landing.hero.*.alt`,
 * `landing.uc.*.alt`) because it has to be in Hindi too; the manifest's is the
 * English original it was written from.
 *
 * Imports nothing.
 */
export interface LandingClip {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly sources: readonly { readonly src: string; readonly type: string }[];
  readonly poster: { readonly webp: string; readonly jpg: string };
}

const BASE = '/media/landing';

const WEBM = 'video/webm; codecs=vp9';

const clip = (id: string, width: number, height: number, mp4Codec: string): LandingClip => ({
  id,
  width,
  height,
  sources: [
    { src: `${BASE}/${id}.webm`, type: WEBM },
    { src: `${BASE}/${id}.mp4`, type: `video/mp4; codecs=${mp4Codec}` },
  ],
  poster: { webp: `${BASE}/${id}-poster.webp`, jpg: `${BASE}/${id}-poster.jpg` },
});

/** `lg` — where the desktop recording in a browser frame takes over from the phone. */
export const DESKTOP_MEDIA = '(min-width: 1024px)';
export const MOBILE_MEDIA = '(max-width: 1023.98px)';

export const HERO_DESKTOP = clip('hero-desktop', 1280, 800, 'avc1.4D4020');
export const HERO_MOBILE = clip('hero-mobile', 780, 1688, 'avc1.4D4028');

export const USE_CASE_IDS = ['khata', 'reminder', 'bill', 'stock', 'purchase', 'reports'] as const;
export type UseCaseId = (typeof USE_CASE_IDS)[number];

export const FEATURE_CLIPS: Readonly<
  Record<UseCaseId, { readonly desktop: LandingClip; readonly mobile: LandingClip }>
> = Object.fromEntries(
  USE_CASE_IDS.map((id) => [
    id,
    {
      desktop: clip(`feat-${id}-desktop`, 1280, 800, 'avc1.4D4020'),
      mobile: clip(`feat-${id}-mobile`, 584, 1264, 'avc1.4D401F'),
    },
  ])
) as Record<UseCaseId, { desktop: LandingClip; mobile: LandingClip }>;

/**
 * The narrated demo films. NOT in git (the owner's call: 10–16 MB each, re-cut
 * often), so the URL is configurable — `NEXT_PUBLIC_DEMO_VIDEO_URL_*` through
 * `src/constants.ts` — and the dialog copes with a 404.
 */
export const DEMO_POSTERS = {
  desktop: { webp: `${BASE}/demo-desktop-720-poster.webp`, jpg: `${BASE}/demo-desktop-720-poster.jpg`, width: 1280, height: 720 },
  mobile: { webp: `${BASE}/demo-mobile-poster.webp`, jpg: `${BASE}/demo-mobile-poster.jpg`, width: 540, height: 960 },
} as const;

export const DEMO_CAPTIONS = {
  desktop: `${BASE}/demo-desktop-720.vtt`,
  mobile: `${BASE}/demo-mobile.vtt`,
  srclang: 'hi-Latn',
} as const;
