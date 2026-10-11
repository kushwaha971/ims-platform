/**
 * e2e/demo/voice.mjs — the voice-over, one audio file per caption line.
 *
 *   node e2e/demo/voice.mjs <work-dir>
 *
 * Uses the macOS `say` voices (no account, no upload, nothing leaves the
 * machine): Samantha for English, Lekha for Hindi — both female. Each line of
 * `script.json` becomes <work-dir>/voice/<lang>/<scene>-<n>.wav, and
 * <work-dir>/timing.json records how long each one runs. Because every line is
 * its own file, the captions are timed from the audio itself, not estimated.
 *
 * A better voice (a recorded narrator, or a neural TTS service) drops in here:
 * put files of the same names in place and re-run `build-demo.mjs`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { HERE } from './lib.mjs';

const work = process.argv[2];
if (!work) throw new Error('usage: node e2e/demo/voice.mjs <work-dir>');
const script = JSON.parse(readFileSync(path.join(HERE, 'script.json'), 'utf8'));

export const VOICES = { en: { name: 'Samantha', rate: 172 }, hi: { name: 'Lekha', rate: 168 } };
/** Silence after each line, and after each scene, in seconds. */
export const GAP = { line: 0.35, scene: 0.7 };

const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());

const timing = {};
for (const lang of Object.keys(VOICES)) {
  const dir = path.join(work, 'voice', lang);
  mkdirSync(dir, { recursive: true });
  timing[lang] = {};
  for (const scene of script.scenes) {
    timing[lang][scene.id] = scene[lang].map((line, n) => {
      const aiff = path.join(dir, `${scene.id}-${n}.aiff`);
      const wav = path.join(dir, `${scene.id}-${n}.wav`);
      execFileSync('say', ['-v', VOICES[lang].name, '-r', String(VOICES[lang].rate), '-o', aiff, line.say ?? line.t]);
      // 48 kHz mono, loudness-normalised, so the two languages sit at one level.
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', aiff, '-af', 'loudnorm=I=-18:TP=-2:LRA=7', '-ar', '48000', '-ac', '1', wav]);
      return +duration(wav).toFixed(3);
    });
  }
}
const sceneSeconds = (lang, id) => timing[lang][id].reduce((sum, d) => sum + d + GAP.line, 0) + GAP.scene;
const scenes = Object.fromEntries(script.scenes.map((scene) => [scene.id, { en: +sceneSeconds('en', scene.id).toFixed(2), hi: +sceneSeconds('hi', scene.id).toFixed(2) }]));
writeFileSync(path.join(work, 'timing.json'), JSON.stringify({ lines: timing, scenes, gap: GAP }, null, 1));
const total = (lang) => Object.values(scenes).reduce((sum, s) => sum + s[lang], 0);
console.log(JSON.stringify({ scenes, totalEn: +total('en').toFixed(1), totalHi: +total('hi').toFixed(1) }));
