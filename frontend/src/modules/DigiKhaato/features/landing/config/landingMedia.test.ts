/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FEATURE_CLIPS, HERO_DESKTOP, HERO_MOBILE, USE_CASE_IDS, type LandingClip } from './media';

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
const manifest = JSON.parse(
  readFileSync(join(PUBLIC, 'media/landing/manifest.json'), 'utf8')
) as { assets: ManifestAsset[] };
const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));

const clips: readonly LandingClip[] = [
  HERO_DESKTOP,
  HERO_MOBILE,
  ...USE_CASE_IDS.flatMap((id) => [FEATURE_CLIPS[id].desktop, FEATURE_CLIPS[id].mobile]),
];

describe('landing media config matches manifest.json', () => {
  it.each(clips.map((clip) => [clip.id, clip]))('%s has the manifest size, codecs and files', (id, clip) => {
    const asset = byId.get(id);
    expect(asset).toBeDefined();
    expect([clip.width, clip.height]).toEqual([asset?.width, asset?.height]);
    expect(clip.sources).toEqual(asset?.sources.map(({ src, type }) => ({ src, type })));
    expect(clip.poster).toEqual({ webp: asset?.poster.webp, jpg: asset?.poster.jpg });
    [...clip.sources.map((s) => s.src), clip.poster.webp, clip.poster.jpg].forEach((src) =>
      expect(existsSync(join(PUBLIC, src))).toBe(true)
    );
  });

  it('puts webm before mp4, so a browser that plays both takes the smaller file', () => {
    clips.forEach((clip) => {
      expect(clip.sources[0]?.type).toMatch(/^video\/webm/);
      expect(clip.sources[1]?.type).toMatch(/^video\/mp4; codecs=avc1/);
    });
  });
});
