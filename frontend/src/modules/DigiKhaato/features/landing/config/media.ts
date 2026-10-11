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
 * Imports only the demo base URL.
 */
import { DEMO_VIDEO_BASE_URL } from 'src/constants';

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
 * The module cards' recordings (11 Oct 2026): real screens of the demo book
 * (`e2e/demo/seed-demo.mjs`), recorded by `e2e/demo/record-clips.mjs` — one
 * take of the desktop layout and one of the phone layout for each module. The
 * Shop card uses the GST-bill loop, which is that module's signature job.
 */
const pair = (id: string): { readonly desktop: LandingClip; readonly mobile: LandingClip } => ({
  desktop: clip(`${id}-desktop`, 1280, 800, 'avc1.4D4020'),
  mobile: clip(`${id}-mobile`, 584, 1264, 'avc1.4D401F'),
});

export const MODULE_CLIPS = {
  shop: FEATURE_CLIPS.bill,
  library: pair('mod-library'),
  lending: pair('mod-lending'),
} as const;

/** `sm` — below it a module card shows the phone recording in a phone frame. */
export const CARD_DESKTOP_MEDIA = '(min-width: 640px)';
export const CARD_MOBILE_MEDIA = '(max-width: 639.98px)';

/**
 * The narrated demo film: ONE narration, in Hindi, in two cuts — the desktop
 * layout (16:9) and the phone layout (portrait, tapped through like a phone).
 * Six everyday problems, each told as problem, real moment, the steps on the
 * real screens, and the benefit. Each cut has Hindi captions and an English
 * subtitle track (`.vtt`) and a poster; the transcript, in both languages, is
 * `config/demoTranscript.ts`. Built by `e2e/demo/build-demo.mjs`.
 *
 * The separate English film was withdrawn on 11 Oct 2026 (owner): one film
 * made well, for both screen sizes, rather than four.
 */
/** The languages the film's WORDS are in: Hindi is spoken, English is its subtitle track. */
export type DemoLanguage = 'en' | 'hi';
export type DemoDevice = 'desktop' | 'mobile';

/** The language the film is narrated in. One film, not one per language (owner, 11 Oct 2026). */
export const DEMO_VOICE: DemoLanguage = 'hi';

export interface DemoFilmFiles {
  /** Site-relative file name stem under the demo base URL, e.g. `demo-hi-desktop`. */
  readonly id: string;
  readonly poster: { readonly webp: string; readonly jpg: string };
  /** A text track per language: captions in the voice's, subtitles in the other. */
  readonly tracks: Readonly<Record<DemoLanguage, string>>;
}

const film = (device: DemoDevice): DemoFilmFiles => {
  const id = `demo-${DEMO_VOICE}-${device}`;
  return {
    id,
    poster: { webp: `${BASE}/${id}-poster.webp`, jpg: `${BASE}/${id}-poster.jpg` },
    tracks: { hi: `${BASE}/${id}.vtt`, en: `${BASE}/${id}.en.vtt` },
  };
};

export const DEMO_FILMS: Readonly<Record<DemoDevice, DemoFilmFiles>> = {
  desktop: film('desktop'),
  mobile: film('mobile'),
};

/**
 * The film file for a cut: the demo base URL plus its id. Here, not in the
 * (client) demo section, because `app/page.tsx` builds structured data with it
 * on the server, where an export of a `'use client'` file is not callable.
 */
export const demoVideoUrl = (id: string): string => `${DEMO_VIDEO_BASE_URL}/${id}.mp4`;
