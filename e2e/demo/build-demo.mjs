/**
 * e2e/demo/build-demo.mjs — cuts the narrated demo films and everything that
 * travels with them, from one script.
 *
 *   node e2e/demo/build-demo.mjs <work-dir> [--publish]
 *
 * In:  script.json (the words), <work>/timing.json and <work>/voice/ (from
 *      voice.mjs), <work>/<device>/segment-*.webm and timeline.json (from
 *      record-demo.mjs).
 * Out, per layout (desktop, mobile), in <work>/out/ — one narration, Hindi:
 *      demo-hi-<device>.mp4            H.264 + AAC, faststart
 *                                      (desktop 1280x720, phone 720x1558)
 *      demo-hi-<device>.vtt            Hindi captions
 *      demo-hi-<device>.en.vtt         English subtitles, line for line
 *      demo-hi-<device>-poster.{jpg,webp}
 *      storyboard-<device>.md          scene, problem, screen, actions, narration, timecodes
 *      demo-<lang>-transcript.md       the narration as text, by chapter (hi, and en translation)
 * and, once, `demoTranscript.ts` — the chapters, timings and words the landing
 * page renders and puts in its structured data.
 *
 * `--publish` copies the films, captions and posters into
 * frontend/public/media/landing/ (removing the films of a language that is no
 * longer made) and writes demoTranscript.ts into the landing feature's config.
 *
 * EVERY LINE IS LAID WHERE IT WAS SPOKEN. The recorder stamps the moment it
 * began performing what each line describes (`timeline[].lines`), and the
 * line's audio and its caption are placed at exactly that offset in the scene.
 * Nothing here estimates a time.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { HERE, writePosters } from './lib.mjs';

const [work, flag] = process.argv.slice(2);
if (!work) throw new Error('usage: node e2e/demo/build-demo.mjs <work-dir> [--publish]');
const REPO = path.join(HERE, '..', '..');
const script = JSON.parse(readFileSync(path.join(HERE, 'script.json'), 'utf8'));
const timing = JSON.parse(readFileSync(path.join(work, 'timing.json'), 'utf8'));
const outDir = path.join(work, 'out');
mkdirSync(outDir, { recursive: true });

const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
const stamp = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t) % 60).padStart(2, '0')}`;
const VOICED = timing.lang;
const LANGS = ['hi', 'en'];
const TITLE = { en: 'YourKhata product demo (Hindi voice, English subtitles)', hi: 'YourKhata प्रोडक्ट डेमो (हिन्दी)' };
const DESCRIPTION = {
  en: 'Six everyday business problems and how YourKhata solves each one, step by step on real screens: starting with only what you need, credit, bills, stock, monthly fees and daily collections. Hindi voice-over, with English subtitles.',
  hi: 'रोज़ की छह मुश्किलें, और YourKhata में हर एक का हल, असली स्क्रीन पर एक-एक कदम में: सिर्फ़ अपने काम की चीज़ों से शुरुआत, उधार, बिल, स्टॉक, महीने की फीस और रोज़ की वसूली। हिंदी आवाज़ और कैप्शन के साथ।',
};
const PART = { title: 'Title', problem: 'Problem and scenario', solution: 'Solution, step by step, and its benefit' };

const sceneOf = (id) => script.scenes.find((s) => s.id === id);
const chapterScenes = script.chapters.map((chapter, i) => {
  const firstIndex = script.scenes.findIndex((s) => s.id === chapter.from);
  const next = script.chapters[i + 1];
  const lastIndex = next ? script.scenes.findIndex((s) => s.id === next.from) : script.scenes.length;
  return { id: chapter.id, from: chapter.from, scenes: script.scenes.slice(firstIndex, lastIndex) };
});

const cuts = {};
const manifestEntries = [];
for (const device of ['desktop', 'mobile']) {
  const dir = path.join(work, device);
  const timelineFile = path.join(dir, 'timeline.json');
  if (!existsSync(timelineFile)) { console.log(`skip ${device}: no recording`); continue; }
  const { timeline, missed, size } = JSON.parse(readFileSync(timelineFile, 'utf8'));
  if (missed.length) throw new Error(`${device}: the recording missed steps — ${missed.join('; ')}`);
  const id = `demo-${VOICED}-${device}`;
  const tmp = path.join(dir, 'cut');
  mkdirSync(tmp, { recursive: true });

  // 1. Cut each scene's picture, and lay each line's voice where it was spoken.
  const parts = [];
  const reels = {};
  const cues = [];
  const sceneStarts = {};
  let at = 0;
  for (const entry of timeline) {
    const length = +(entry.end - entry.start).toFixed(3);
    const video = path.join(tmp, `${entry.scene}.mp4`);
    // The scene's picture: every frame for exactly as long as it was on screen.
    const reel = (reels[entry.segment] ??= JSON.parse(readFileSync(path.join(dir, `frames-${entry.segment}.json`), 'utf8')));
    let first = reel.frames.findLastIndex((f) => f.t <= entry.start);
    if (first < 0) first = 0;
    const shown = reel.frames.slice(first).filter((f, i) => i === 0 || f.t < entry.end);
    const list = ['ffconcat version 1.0'];
    shown.forEach((f, i) => {
      const from = Math.max(f.t, entry.start);
      const to = Math.min(shown[i + 1]?.t ?? entry.end, entry.end);
      list.push(`file '${path.join(dir, reel.dir, f.file)}'`, `duration ${Math.max(to - from, 0.001).toFixed(4)}`);
    });
    // The concat demuxer needs the last file named again to honour its duration.
    list.push(`file '${path.join(dir, reel.dir, shown.at(-1).file)}'`);
    const listFile = path.join(tmp, `${entry.scene}.ffconcat`);
    writeFileSync(listFile, list.join('\n'));
    ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-an', '-t', String(length), '-vf', `fps=30,scale=${size.width}:${size.height}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', device === 'mobile' ? '25' : '24', '-g', '60', video]);
    const actual = probe(video);

    const scene = sceneOf(entry.scene);
    const inputs = [];
    const filters = [];
    scene[VOICED].forEach((line, n) => {
      const d = timing.lines[entry.scene][n];
      const offset = entry.lines[n];
      inputs.push('-i', path.join(work, 'voice', VOICED, `${entry.scene}-${n}.wav`));
      filters.push(`[${n}:a]adelay=${Math.round(offset * 1000)}:all=1[a${n}]`);
      cues.push({ start: at + offset, end: at + offset + d + 0.3, scene: entry.scene, n });
    });
    const audio = path.join(tmp, `${entry.scene}.wav`);
    ff([...inputs, '-filter_complex', `${filters.join(';')};${scene[VOICED].map((_, n) => `[a${n}]`).join('')}amix=inputs=${scene[VOICED].length}:normalize=0,apad[o]`, '-map', '[o]', '-t', String(actual), '-ar', '48000', '-ac', '1', audio]);
    parts.push({ video, audio });
    sceneStarts[entry.scene] = at;
    at += actual;
  }

  // 2. Join the scenes, lay the voice over, and make it start fast on the web.
  const listV = path.join(tmp, 'v.txt');
  const listA = path.join(tmp, 'a.txt');
  writeFileSync(listV, parts.map((p) => `file '${p.video}'`).join('\n'));
  writeFileSync(listA, parts.map((p) => `file '${p.audio}'`).join('\n'));
  const silent = path.join(tmp, 'picture.mp4');
  const voice = path.join(tmp, 'voice.wav');
  ff(['-f', 'concat', '-safe', '0', '-i', listV, '-c', 'copy', silent]);
  ff(['-f', 'concat', '-safe', '0', '-i', listA, '-c', 'copy', voice]);
  const film = path.join(outDir, `${id}.mp4`);
  ff(['-i', silent, '-i', voice, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', '-metadata', `title=${TITLE[VOICED]}`, '-metadata:s:a:0', 'language=hin', film]);
  const duration = probe(film);

  // 3. Captions in the voice's language, and subtitles in the other, from the same cue times.
  for (const lang of LANGS) {
    const body = cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(Math.min(c.end, cues[i + 1]?.start ?? duration, duration))}\n${sceneOf(c.scene)[lang][c.n].t}`).join('\n\n');
    writeFileSync(path.join(outDir, `${id}${lang === VOICED ? '' : `.${lang}`}.vtt`), `WEBVTT\n\n${body}\n`);
  }

  // 4. The poster: the customer list, as the second line of the credit scene begins.
  const creditEntry = timeline.find((e) => e.scene === 'credit');
  const posterAt = (sceneStarts.credit ?? 0) + (creditEntry?.lines[1] ?? 2) - 0.4;
  const png = path.join(tmp, 'poster.png');
  ff(['-ss', String(posterAt), '-i', film, '-frames:v', '1', png]);
  await writePosters(png, path.join(outDir, `${id}-poster`), { webp: 78, jpg: 82 });

  // 5. Where each chapter starts in this cut, and the storyboard.
  cuts[device] = { width: size.width, height: size.height, durationSeconds: Math.round(duration), starts: chapterScenes.map((c) => Math.round(sceneStarts[c.from] ?? 0)) };
  writeFileSync(path.join(outDir, `storyboard-${device}.md`), `# YourKhata product demo — storyboard and narration (${device})\n\nLayout: ${device === 'mobile' ? 'phone, 390 px wide, touch' : 'desktop, 1280 px wide'}. Length ${clock(duration)}. Picture ${size.width}x${size.height}. Voice: Hindi, macOS \`say\`, ${timing.voice.name} at ${timing.voice.rate} words a minute (female, computer-generated), ${timing.gap.line}s between lines. English is the subtitle track.\n\nEvery feature follows one order: the problem and a real moment it bites (a still card), then the answer performed step by step on the real screen, and its benefit in the last line. Recorded by \`e2e/demo/record-demo.mjs\` on the demo stack; each line is spoken from the moment the recorder begins the step it describes (the timecode beside it).\n\n${timeline.map((entry, i) => { const s = sceneOf(entry.scene); const t0 = sceneStarts[s.id]; return `## Scene ${i + 1}: ${s.id} — ${PART[s.part]} (${clock(t0)}–${clock(t0 + (entry.end - entry.start))})\n\n- **On screen:** ${s.screen}\n- **Recorded actions:** ${s.actions}\n- **Narration:**\n${s.hi.map((l, n) => `  - \`${clock(t0 + entry.lines[n])}\` ${l.t}\n    - _${s.en[n].t}_`).join('\n')}`; }).join('\n\n')}\n`);

  const bytes = readFileSync(film).length;
  manifestEntries.push({ id, kind: 'demo', device, language: VOICED, width: size.width, height: size.height, duration: +duration.toFixed(2), fps: 30, loop: false, audio: true, sources: [{ src: `/media/landing/${id}.mp4`, type: 'video/mp4; codecs=avc1.4D401F,mp4a.40.2', bytes }], bytes, poster: { webp: `/media/landing/${id}-poster.webp`, jpg: `/media/landing/${id}-poster.jpg` }, captions: `/media/landing/${id}.vtt`, subtitles: { en: `/media/landing/${id}.en.vtt` }, alt: DESCRIPTION.en });
  console.log(JSON.stringify({ id, duration: +duration.toFixed(1), megabytes: +(bytes / 1048576).toFixed(1), cues: cues.length }));
}

if (!Object.keys(cuts).length) throw new Error('no recordings to build from');
// A film cut for one layout only still needs both keys for the page's types.
cuts.desktop ??= cuts.mobile;
cuts.mobile ??= cuts.desktop;

const films = Object.fromEntries(LANGS.map((lang) => [lang, { name: TITLE[lang], description: DESCRIPTION[lang], chapters: chapterScenes.map((c) => ({ id: c.id, paragraphs: c.scenes.map((s) => s[lang].map((l) => l.t).join(' ')) })), cuts }]));
for (const lang of LANGS) writeFileSync(path.join(outDir, `demo-${lang}-transcript.md`), `# ${TITLE[lang]} — transcript\n\n${films[lang].chapters.map((c, i) => `## ${clock(cuts.desktop.starts[i])} — ${c.id}\n\n${c.paragraphs.join('\n\n')}`).join('\n\n')}\n`);


// 6. What the landing page reads.
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const ts = `/**
 * GENERATED by e2e/demo/build-demo.mjs from e2e/demo/script.json — do not edit.
 *
 * The narrated demo films' chapters, timings and words: what the demo section
 * shows as chapters and transcript, and what the VideoObject structured data
 * quotes. Generated from the same script and the same audio as the films and
 * their captions, so the page can never describe a film it does not have.
 *
 * ONE film, narrated in Hindi, in two cuts — the desktop layout and the phone
 * layout. \`hi\` is what is said; \`en\` is its translation, line for line (the
 * English subtitle track and the English transcript), so both share the cuts.
 */
export type DemoChapterId = ${script.chapters.map((c) => `'${c.id}'`).join(' | ')};

export interface DemoChapter {
  readonly id: DemoChapterId;
  /** One paragraph per scene. */
  readonly paragraphs: readonly string[];
}

export interface DemoCut {
  readonly width: number;
  readonly height: number;
  readonly durationSeconds: number;
  /** Where each chapter starts, in seconds, in the order of \`chapters\`. */
  readonly starts: readonly number[];
}

export interface DemoFilm {
  readonly name: string;
  readonly description: string;
  readonly chapters: readonly DemoChapter[];
  readonly cuts: Readonly<Record<'desktop' | 'mobile', DemoCut>>;
}

/** ISO date the films were cut. */
export const DEMO_PUBLISHED_ON = '${today}';

export const DEMO_TRANSCRIPT: Readonly<Record<'en' | 'hi', DemoFilm>> = ${JSON.stringify(films, null, 2)};
`;
writeFileSync(path.join(outDir, 'demoTranscript.ts'), ts);

if (flag === '--publish') {
  const media = path.join(REPO, 'frontend', 'public', 'media', 'landing');
  // Films of a language that is no longer made do not stay behind in the page's folder.
  const keep = new Set(manifestEntries.map((entry) => entry.id));
  for (const file of readdirSync(media)) { const stem = /^(demo-[a-z]+-(?:desktop|mobile))[.-]/.exec(file)?.[1]; if (stem && !keep.has(stem)) rmSync(path.join(media, file)); }
  for (const entry of manifestEntries) for (const suffix of ['.mp4', '.vtt', '.en.vtt', '-poster.jpg', '-poster.webp']) copyFileSync(path.join(outDir, `${entry.id}${suffix}`), path.join(media, `${entry.id}${suffix}`));
  copyFileSync(path.join(outDir, 'demoTranscript.ts'), path.join(REPO, 'frontend', 'src', 'modules', 'DigiKhaato', 'features', 'landing', 'config', 'demoTranscript.ts'));
  // The films join the loops in the one manifest (encode-clips.mjs writes the loops).
  const manifestFile = path.join(media, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  manifest.assets = [...manifest.assets.filter((asset) => asset.kind !== 'demo'), ...manifestEntries];
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const docs = path.join(REPO, 'docs', 'demo');
  mkdirSync(docs, { recursive: true });
  for (const file of readdirSync(docs)) if (/^storyboard-/.test(file)) rmSync(path.join(docs, file));
  for (const lang of LANGS) copyFileSync(path.join(outDir, `demo-${lang}-transcript.md`), path.join(docs, `demo-${lang}-transcript.md`));
  for (const entry of manifestEntries) copyFileSync(path.join(outDir, `storyboard-${entry.device}.md`), path.join(docs, `storyboard-${entry.device}.md`));
  console.log('published to frontend/public/media/landing, the landing config and docs/demo');
}
