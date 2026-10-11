/**
 * e2e/demo/encode-clips.mjs — turns the raw takes from record-clips.mjs into
 * the files the landing page serves, and writes the manifest that names them.
 *
 *   node e2e/demo/encode-clips.mjs <raw-dir> [--publish]
 *
 * For each clip: cut the lead-in, play it a little faster so a loop stays
 * short (a hand moving at recording pace reads as slow on a landing page),
 * scale to its published size, and write
 *     <id>.webm   VP9   (first source: smaller where it plays)
 *     <id>.mp4    H.264 Main, yuv420p, faststart, no audio track
 *     <id>-poster.webp / .jpg   the loop's FIRST frame, so the poster and the
 *                               video are the same picture and nothing jumps
 * `--publish` replaces frontend/public/media/landing/'s loops and manifest.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { HERE, writePosters } from './lib.mjs';

const [raw, flag] = process.argv.slice(2);
if (!raw) throw new Error('usage: node e2e/demo/encode-clips.mjs <raw-dir> [--publish]');
const out = path.join(raw, 'out');
mkdirSync(out, { recursive: true });
const index = JSON.parse(readFileSync(path.join(raw, 'clips.json'), 'utf8'));
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());

/** Published size, H.264 level and the longest a loop should run, by kind and device. */
const SHAPE = {
  'hero-desktop': { w: 1280, h: 800, level: '3.2', codec: 'avc1.4D4020', target: 16 },
  'hero-mobile': { w: 780, h: 1688, level: '4.0', codec: 'avc1.4D4028', target: 16 },
  desktop: { w: 1280, h: 800, level: '3.2', codec: 'avc1.4D4020', target: 11 },
  mobile: { w: 584, h: 1264, level: '3.1', codec: 'avc1.4D401F', target: 11 },
};
const MAX_SPEED = 1.7;

/** What each loop shows. The page's own alt text is the catalogue's (it has to be in Hindi too). */
const WORDS = {
  hero: ['hero', "the dashboard with To collect and To pay, a ₹1,200 'You gave' entry saved to Ramesh Traders' account, then a GST tax invoice filled in and issued.", 'Dashboard, a money-owed entry and a GST bill in one loop.'],
  'feat-khata': ['feature', "the customer list, then Ramesh Traders' account, where a ₹1,200 'You gave' entry with a note is saved and the balance updates.", 'Record money owed in seconds; the running balance updates the moment you save.'],
  'feat-reminder': ['feature', "a customer's account, then Send reminder with the ready WhatsApp message, then the aging list of who owes and for how long.", 'A polite, exact reminder in two taps. You press send.'],
  'feat-bill': ['feature', 'a two-item tax invoice with CGST and SGST filled in automatically, then the issued invoice.', 'GST worked out as you add items.'],
  'feat-stock': ['feature', "the item list, the Low tab, an item's stock card with its movements, then Adjust stock.", 'What is in stock, what is low, and every movement.'],
  'feat-purchase': ['feature', 'a purchase bill from Gupta Wholesale with GST worked out, recorded as paid from the Paid now sheet.', 'Purchases with input GST, and the supplier paid in the same step.'],
  'feat-reports': ['feature', 'the Reports hub, then the day book, then the GST summary.', 'Day book, aging, registers and the GST summary.'],
  'mod-library': ['module', "the Library module: today's fees and seats, the book catalogue searched for a title, then a book issued to a student at the counter.", 'Students, seats, fees and books in one place.'],
  'mod-lending': ['module', "the Lending module: today's collection list, a collection saved for a borrower, then the list of running loans with what is left on each.", 'Every loan and every collection, on record.'],
};

const assets = [];
for (const id of Object.keys(index).sort()) {
  const entry = index[id];
  if (entry.missed?.length) throw new Error(`${id}: the take missed steps — ${entry.missed.join('; ')}`);
  const device = id.endsWith('-mobile') ? 'mobile' : 'desktop';
  const base = id.replace(/-(desktop|mobile)$/, '');
  const shape = SHAPE[id] ?? SHAPE[device];
  const speed = Math.min(MAX_SPEED, Math.max(1, entry.duration / shape.target));
  const source = path.join(raw, `${id}.raw.webm`);
  const filter = `setpts=PTS/${speed.toFixed(3)},fps=30,scale=${shape.w}:${shape.h}:flags=lanczos,format=yuv420p`;
  const cut = ['-ss', String(entry.trimStart), '-t', String(entry.duration), '-i', source, '-an', '-vf', filter];
  const mp4 = path.join(out, `${id}.mp4`);
  const webm = path.join(out, `${id}.webm`);
  ff([...cut, '-c:v', 'libx264', '-profile:v', 'main', '-level', shape.level, '-preset', 'slow', '-crf', '27', '-g', '90', '-movflags', '+faststart', mp4]);
  ff([...cut, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-g', '90', webm]);
  const png = path.join(out, `${id}-poster.png`);
  ff(['-i', mp4, '-frames:v', '1', png]);
  await writePosters(png, path.join(out, `${id}-poster`));
  const bytes = (file) => statSync(path.join(out, file)).size;
  const [kind, alt, caption] = WORDS[base];
  const where = device === 'mobile' ? 'On a phone: ' : 'On a computer: ';
  assets.push({
    id, kind, device, width: shape.w, height: shape.h, duration: +probe(mp4).toFixed(2), fps: 30, loop: true, audio: false,
    sources: [
      { src: `/media/landing/${id}.webm`, type: 'video/webm; codecs=vp9', bytes: bytes(`${id}.webm`) },
      { src: `/media/landing/${id}.mp4`, type: `video/mp4; codecs=${shape.codec}`, bytes: bytes(`${id}.mp4`) },
    ],
    bytes: bytes(`${id}.webm`) + bytes(`${id}.mp4`),
    poster: { webp: `/media/landing/${id}-poster.webp`, jpg: `/media/landing/${id}-poster.jpg`, bytes: { webp: bytes(`${id}-poster.webp`), jpg: bytes(`${id}-poster.jpg`) } },
    alt: where + alt, caption, speed: +speed.toFixed(2),
  });
  console.log(id, `${assets.at(-1).duration}s`, `x${speed.toFixed(2)}`, `${Math.round(bytes(`${id}.webm`) / 1024)}K webm`, `${Math.round(bytes(`${id}.mp4`) / 1024)}K mp4`);
}

const order = (a) => [a.kind === 'hero' ? 0 : a.kind === 'feature' ? 1 : 2, a.id];
assets.sort((a, b) => (order(a) < order(b) ? -1 : 1));
const manifest = {
  version: 2,
  generated: new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10),
  note: 'Silent loops recorded from real YourKhata screens on the demo stack (e2e/demo/record-clips.mjs), one take for the desktop layout and one for the phone layout. Posters equal each loop\'s first frame. Every name, number and the UPI handle sharmastore.demo@example are seeded demo data (e2e/demo/seed-demo.mjs).',
  assets,
};
writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

if (flag === '--publish') {
  const media = path.join(HERE, '..', '..', 'frontend', 'public', 'media', 'landing');
  for (const asset of assets) for (const suffix of ['.webm', '.mp4', '-poster.webp', '-poster.jpg']) copyFileSync(path.join(out, `${asset.id}${suffix}`), path.join(media, `${asset.id}${suffix}`));
  // The narrated films keep their own entries, written by build-demo.mjs.
  copyFileSync(path.join(out, 'manifest.json'), path.join(media, 'manifest.json'));
  console.log(`published ${assets.length} loops and the manifest`);
}
