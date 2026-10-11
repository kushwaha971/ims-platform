/**
 * e2e/demo/voice.mjs — the voice-over, one audio file per caption line.
 *
 *   node e2e/demo/voice.mjs <work-dir>
 *
 * Uses a macOS `say` voice (no account, no upload, nothing leaves the
 * machine): Lekha, Hindi, female. Each line of `script.json` becomes
 * <work-dir>/voice/hi/<scene>-<n>.wav, and <work-dir>/timing.json records how
 * long each one runs. Because every line is its own file, the recorder can
 * start each line at the moment it performs what the line describes, and the
 * captions are timed from the audio itself.
 *
 * PACE (owner, 11 Oct 2026: "too fast, and not in step with the screen"). The
 * first films were read at 168 words a minute with a third of a second between
 * lines, which is a news reader, not somebody showing you a screen. Now: 138
 * words a minute, a breath after every sentence inside a line, most of a
 * second between lines and a full pause between scenes — and the picture
 * waits for the voice (`record-demo.mjs`), not the other way round.
 *
 * A better voice (a recorded narrator, or a neural TTS service) drops in here:
 * put files of the same names in place and re-run the recorder and the build.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { HERE } from './lib.mjs';

const work = process.argv[2];
if (!work) throw new Error('usage: node e2e/demo/voice.mjs <work-dir>');
const script = JSON.parse(readFileSync(path.join(HERE, 'script.json'), 'utf8'));

export const VOICE = { lang: script.voiced, name: 'Lekha', rate: 138 };
/** Silence after each line, and after each scene, in seconds. */
export const GAP = { line: 0.8, scene: 1.3 };
/** A breath between the sentences of one line, in milliseconds. */
const BREATH = 380;

const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
/** `say` reads `[[slnc N]]` as N ms of silence: one after every sentence but the last, and a shorter one at a comma. */
const paced = (text) => text.replace(/([।?!])\s+(?=\S)/g, `$1 [[slnc ${BREATH}]] `).replace(/,\s+(?=\S)/g, `, [[slnc 140]] `);

const lang = VOICE.lang;
const dir = path.join(work, 'voice', lang);
mkdirSync(dir, { recursive: true });
const lines = {};
for (const scene of script.scenes) {
  lines[scene.id] = scene[lang].map((line, n) => {
    const aiff = path.join(dir, `${scene.id}-${n}.aiff`);
    const wav = path.join(dir, `${scene.id}-${n}.wav`);
    execFileSync('say', ['-v', VOICE.name, '-r', String(VOICE.rate), '-o', aiff, paced(line.say ?? line.t)]);
    // 48 kHz mono, loudness-normalised, with the silence `say` leaves at the end trimmed
    // so a line's length is the length of its words.
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', aiff, '-af', 'areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=7', '-ar', '48000', '-ac', '1', wav]);
    return +duration(wav).toFixed(3);
  });
}
const spoken = Object.values(lines).flat();
const total = spoken.reduce((sum, d) => sum + d + GAP.line, 0) + script.scenes.length * GAP.scene;
writeFileSync(path.join(work, 'timing.json'), JSON.stringify({ lang, voice: VOICE, lines, gap: GAP }, null, 1));
console.log(JSON.stringify({ lines: spoken.length, longest: Math.max(...spoken), narrationSeconds: +total.toFixed(1) }));
