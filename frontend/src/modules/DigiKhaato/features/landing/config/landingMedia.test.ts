/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEMO_FILMS,
  FEATURE_CLIPS,
  HERO_DESKTOP,
  HERO_MOBILE,
  MODULE_CLIPS,
  USE_CASE_IDS,
  type LandingClip,
} from './media';

/**
 * `media.ts` restates what the page needs from `manifest.json` so the page
 * does not ship the manifest. A restatement drifts: a re-cut clip at a new
 * size would leave the box's aspect-ratio wrong — layout shift, or a letterbox
 * — and a renamed file would 404 behind a poster forever. This compares the
 * two, and checks every loop and poster the page names is actually on disk
 * (and so, by the .gitignore negation, in git).
 */
interface ManifestAsset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly sources: readonly { readonly src: string; readonly type: string }[];
  readonly poster: { readonly webp: string; readonly jpg: string };
}

const PUBLIC = join(process.cwd(), 'public');
const manifest = JSON.parse(readFileSync(join(PUBLIC, 'media/landing/manifest.json'), 'utf8')) as {
  assets: ManifestAsset[];
};
const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));

const clips: readonly LandingClip[] = [
  HERO_DESKTOP,
  HERO_MOBILE,
  ...USE_CASE_IDS.flatMap((id) => [FEATURE_CLIPS[id].desktop, FEATURE_CLIPS[id].mobile]),
  MODULE_CLIPS.library.desktop,
  MODULE_CLIPS.library.mobile,
  MODULE_CLIPS.lending.desktop,
  MODULE_CLIPS.lending.mobile,
];

describe('landing media config matches manifest.json', () => {
  it.each(clips.map((clip) => [clip.id, clip]))(
    '%s has the manifest size, codecs and files',
    (id, clip) => {
      const asset = byId.get(id);
      expect(asset).toBeDefined();
      expect([clip.width, clip.height]).toEqual([asset?.width, asset?.height]);
      expect(clip.sources).toEqual(asset?.sources.map(({ src, type }) => ({ src, type })));
      expect(clip.poster).toEqual({ webp: asset?.poster.webp, jpg: asset?.poster.jpg });
      [...clip.sources.map((s) => s.src), clip.poster.webp, clip.poster.jpg].forEach((src) =>
        expect(existsSync(join(PUBLIC, src))).toBe(true)
      );
    }
  );

  it('puts webm before mp4, so a browser that plays both takes the smaller file', () => {
    clips.forEach((clip) => {
      expect(clip.sources[0]?.type).toMatch(/^video\/webm/);
      expect(clip.sources[1]?.type).toMatch(/^video\/mp4; codecs=avc1/);
    });
  });

  /**
   * The narrated film in its two cuts (desktop and phone), with its Hindi
   * captions, its English subtitles and its posters: everything the page can
   * ask for is on disk and in the manifest, and both text tracks are WebVTT
   * files with the SAME cue times — a subtitle that drifts from the caption
   * it translates is a subtitle on the wrong sentence.
   */
  it.each(
    (['desktop', 'mobile'] as const).map(
      (device) => [`demo-hi-${device}`, DEMO_FILMS[device]] as const
    )
  )('%s has its film, both text tracks and posters', (id, film) => {
    expect(film.id).toBe(id);
    expect(byId.get(id)).toBeDefined();
    [
      `/media/landing/${id}.mp4`,
      film.tracks.hi,
      film.tracks.en,
      film.poster.webp,
      film.poster.jpg,
    ].forEach((src) => expect(existsSync(join(PUBLIC, src))).toBe(true));
    const times = (src: string): string[] => {
      const vtt = readFileSync(join(PUBLIC, src), 'utf8');
      expect(vtt.startsWith('WEBVTT')).toBe(true);
      return vtt.match(/^\d\d:.* --> .*$/gm) ?? [];
    };
    expect(times(film.tracks.hi).length).toBeGreaterThan(20);
    expect(times(film.tracks.en)).toEqual(times(film.tracks.hi));
  });

  it('keeps none of the retired films', () => {
    // The first two, and the separate English film withdrawn on 11 Oct 2026.
    [
      'demo-desktop-720.mp4',
      'demo-mobile.mp4',
      'demo-en-desktop.mp4',
      'demo-en-mobile.mp4',
      'demo-en-desktop.vtt',
    ].forEach((file) => expect(existsSync(join(PUBLIC, 'media/landing', file))).toBe(false));
  });
});
