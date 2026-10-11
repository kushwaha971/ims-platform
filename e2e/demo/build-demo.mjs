/**
 * e2e/demo/build-demo.mjs — cuts the narrated demo films and everything that
 * travels with them, from one script.
 *
 *   node e2e/demo/build-demo.mjs <work-dir> [--publish]
 *
 * In:  script.json (the words), <work>/timing.json and <work>/voice/ (from
 *      voice.mjs), <work>/<lang>-<device>/segment-*.webm and timeline.json
 *      (from record-demo.mjs).
 * Out, per language AND per layout (desktop, mobile), in <work>/out/:
 *      demo-<lang>-<device>.mp4            H.264 + AAC, faststart
 *                                          (desktop 1280x720, phone 720x1558)
 *      demo-<lang>-<device>.vtt            captions, timed from the audio itself
 *      demo-<lang>-<device>-poster.{jpg,webp}
 *      storyboard-<lang>-<device>.md       scene, screen, actions, narration, timecodes
 *      demo-<lang>-transcript.md           the narration as text, by chapter
 * and, once, `demoTranscript.ts` — the chapters, timings and words the landing
 * page renders and puts in its structured data.
 *
 * `--publish` copies the films, captions and posters into
 * frontend/public/media/landing/ and writes demoTranscript.ts into the landing
 * feature's config. Without it nothing in the repository changes.
 *
 * Every scene is cut from its segment at the times the recorder logged, so a
 * scene is exactly as long as it was held, and the voice for that scene is
 * laid at its start. A caption's time is the sum of the audio before it.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const LANG_NAME = { en: 'English', hi: 'Hindi' };
const TITLE = { en: 'YourKhata product demo (English)', hi: 'YourKhata प्रोडक्ट डेमो (हिन्दी)' };
const DESCRIPTION = {
  en: 'A guided tour of YourKhata: signing up with a mobile number, then Shop & billing, Library and Lending on real screens, with voice-over and captions.',
  hi: 'YourKhata का गाइडेड टूर: मोबाइल नंबर से साइन अप, फिर दुकान और बिलिंग, लाइब्रेरी और कर्ज़ वसूली की असली स्क्रीन, आवाज़ और कैप्शन के साथ।',
};

const films = {};
const manifestEntries = [];
for (const lang of ['en', 'hi']) {
  for (const device of ['desktop', 'mobile']) {
    const dir = path.join(work, `${lang}-${device}`);
    const timelineFile = path.join(dir, 'timeline.json');
    if (!existsSync(timelineFile)) { console.log(`skip ${lang} ${device}: no recording`); continue; }
    const { timeline, missed, size } = JSON.parse(readFileSync(timelineFile, 'utf8'));
    if (missed.length) throw new Error(`${lang} ${device}: the recording missed steps — ${missed.join('; ')}`);
    const id = `demo-${lang}-${device}`;
    const tmp = path.join(dir, 'cut');
    mkdirSync(tmp, { recursive: true });

    // 1. Cut each scene's picture, and build each scene's sound to the same length.
    const parts = [];
    const cues = [];
    const sceneStarts = {};
    let at = 0;
    for (const entry of timeline) {
      const length = +(entry.end - entry.start).toFixed(3);
      const video = path.join(tmp, `${entry.scene}.mp4`);
      ff(['-ss', String(entry.start), '-t', String(length), '-i', path.join(dir, `segment-${entry.segment}.webm`), '-an', '-r', '30', '-vf', `scale=${size.width}:${size.height}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', device === 'mobile' ? '25' : '24', '-g', '60', video]);
      const actual = probe(video);

      const lines = script.scenes.find((s) => s.id === entry.scene)[lang];
      const inputs = [];
      const filters = [];
      let cursor = 0;
      lines.forEach((line, n) => {
        const d = timing.lines[lang][entry.scene][n];
        inputs.push('-i', path.join(work, 'voice', lang, `${entry.scene}-${n}.wav`));
        filters.push(`[${n}:a]adelay=${Math.round(cursor * 1000)}:all=1[a${n}]`);
        cues.push({ start: at + cursor, end: at + cursor + d + 0.25, text: line.t });
        cursor += d + timing.gap.line;
      });
      const audio = path.join(tmp, `${entry.scene}.wav`);
      ff([...inputs, '-filter_complex', `${filters.join(';')};${lines.map((_, n) => `[a${n}]`).join('')}amix=inputs=${lines.length}:normalize=0,apad[o]`, '-map', '[o]', '-t', String(actual), '-ar', '48000', '-ac', '1', audio]);
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
    ff(['-i', silent, '-i', voice, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', '-metadata', `title=${TITLE[lang]}`, '-metadata:s:a:0', `language=${lang === 'hi' ? 'hin' : 'eng'}`, film]);
    const duration = probe(film);

    // 3. Captions, straight from the cue times.
    writeFileSync(path.join(outDir, `${id}.vtt`), `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(Math.min(c.end, duration))}\n${c.text}`).join('\n\n')}\n`);

    // 4. The poster: the dashboard, near the end of the login scene.
    const posterAt = (sceneStarts.login ?? 0) + timing.scenes.login[lang] - 2.5;
    const png = path.join(tmp, 'poster.png');
    ff(['-ss', String(posterAt), '-i', film, '-frames:v', '1', png]);
    await writePosters(png, path.join(outDir, `${id}-poster`), { webp: 78, jpg: 82 });

    // 5. Chapters, the transcript and the storyboard.
    const chapterScenes = script.chapters.map((chapter, i) => {
      const firstIndex = script.scenes.findIndex((s) => s.id === chapter.from);
      const next = script.chapters[i + 1];
      const lastIndex = next ? script.scenes.findIndex((s) => s.id === next.from) : script.scenes.length;
      return { id: chapter.id, from: chapter.from, scenes: script.scenes.slice(firstIndex, lastIndex) };
    });
    films[lang] ??= { name: TITLE[lang], description: DESCRIPTION[lang], chapters: chapterScenes.map((c) => ({ id: c.id, paragraphs: c.scenes.map((s) => s[lang].map((l) => l.t).join(' ')) })), cuts: {} };
    films[lang].cuts[device] = { width: size.width, height: size.height, durationSeconds: Math.round(duration), starts: chapterScenes.map((c) => Math.round(sceneStarts[c.from] ?? 0)) };

    const starts = films[lang].cuts[device].starts;
    if (device === 'desktop' || !existsSync(path.join(outDir, `demo-${lang}-transcript.md`))) {
      writeFileSync(path.join(outDir, `demo-${lang}-transcript.md`), `# ${TITLE[lang]} — transcript\n\n${films[lang].chapters.map((c, i) => `## ${clock(starts[i])} — ${c.id}\n\n${c.paragraphs.join('\n\n')}`).join('\n\n')}\n`);
    }
    writeFileSync(path.join(outDir, `storyboard-${lang}-${device}.md`), `# ${TITLE[lang]} — storyboard and narration (${device})\n\nLanguage: ${LANG_NAME[lang]}. Layout: ${device === 'mobile' ? 'phone, 390 px wide' : 'desktop'}. Length ${clock(duration)}. Picture ${size.width}x${size.height}. Voice: macOS \`say\`, ${lang === 'hi' ? 'Lekha' : 'Samantha'} (female, computer-generated).\n\nRecorded by \`e2e/demo/record-demo.mjs\` on the demo stack; every action below is performed on the real screen.\n\n${timeline.map((entry, i) => { const s = script.scenes.find((x) => x.id === entry.scene); return `## Scene ${i + 1}: ${s.id} (${clock(sceneStarts[s.id])}–${clock(sceneStarts[s.id] + (entry.end - entry.start))})\n\n- **On screen:** ${s.screen}\n- **Recorded actions:** ${s.actions}\n- **Narration:**\n${s[lang].map((l) => `  - ${l.t}`).join('\n')}`; }).join('\n\n')}\n`);

    const bytes = readFileSync(film).length;
    manifestEntries.push({ id, kind: 'demo', device, language: lang, width: size.width, height: size.height, duration: +duration.toFixed(2), fps: 30, loop: false, audio: true, sources: [{ src: `/media/landing/${id}.mp4`, type: 'video/mp4; codecs=avc1.4D401F,mp4a.40.2', bytes }], bytes, poster: { webp: `/media/landing/${id}-poster.webp`, jpg: `/media/landing/${id}-poster.jpg` }, captions: `/media/landing/${id}.vtt`, alt: `${DESCRIPTION[lang]}` });
    console.log(JSON.stringify({ id, duration: +duration.toFixed(1), megabytes: +(bytes / 1048576).toFixed(1), cues: cues.length }));
  }
}

if (!Object.keys(films).length) throw new Error('no recordings to build from');

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
 * Each language has two cuts — the desktop layout and the phone layout — with
 * the same words; only the picture, its size and the chapter times differ.
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
  for (const entry of manifestEntries) for (const suffix of ['.mp4', '.vtt', '-poster.jpg', '-poster.webp']) copyFileSync(path.join(outDir, `${entry.id}${suffix}`), path.join(media, `${entry.id}${suffix}`));
  copyFileSync(path.join(outDir, 'demoTranscript.ts'), path.join(REPO, 'frontend', 'src', 'modules', 'DigiKhaato', 'features', 'landing', 'config', 'demoTranscript.ts'));
  // The films join the loops in the one manifest (encode-clips.mjs writes the loops).
  const manifestFile = path.join(media, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  manifest.assets = [...manifest.assets.filter((asset) => asset.kind !== 'demo'), ...manifestEntries];
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const docs = path.join(REPO, 'docs', 'demo');
  mkdirSync(docs, { recursive: true });
  for (const lang of Object.keys(films)) {
    copyFileSync(path.join(outDir, `demo-${lang}-transcript.md`), path.join(docs, `demo-${lang}-transcript.md`));
    for (const device of Object.keys(films[lang].cuts)) copyFileSync(path.join(outDir, `storyboard-${lang}-${device}.md`), path.join(docs, `storyboard-${lang}-${device}.md`));
  }
  console.log('published to frontend/public/media/landing, the landing config and docs/demo');
}
