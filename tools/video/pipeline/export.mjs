// node export.mjs <video>  → build/<video>/narration.json (TTS + caption source)
//                            and scripts/<video>.md (the human-readable script)
// The story file is the single source of truth, so the script can never drift
// from what is recorded.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
const ROOT = '/home/claude/video';
const video = process.argv[2];
const story = await import(`./stories/${video}.mjs`);
const B = `${ROOT}/build/${video}`;
mkdirSync(B, { recursive: true });
const out = {
  meta: story.meta,
  chapters: story.chapters.map((c) => ({
    id: c.id, title: c.title, card: c.card ?? null, cardOnly: !!c.cardOnly, target: c.target ?? null,
    problem: c.problem ?? '', feature: c.feature ?? '', benefit: c.benefit ?? '', steps: c.steps ?? [],
    segments: c.segments.map((s) => ({ id: s.id, cap: s.cap, say: s.say, onCard: !!s.onCard, lead: s.lead ?? 0 })),
  })),
};
writeFileSync(`${B}/narration.json`, JSON.stringify(out, null, 1));

const durs = existsSync(`${B}/durations.json`) ? JSON.parse(readFileSync(`${B}/durations.json`, 'utf8')) : {};
const est = (s) => durs[s.id]?.secs ?? Math.max(2, s.cap.split(/\s+/).length / 2.3);
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
let md = `# ${story.meta.title}\n\n${story.meta.intro ?? ''}\n\n`;
md += `| | |\n|---|---|\n| Format | ${story.meta.format} |\n| Audience | ${story.meta.audience} |\n| Target length | ${story.meta.targetLength} |\n`;
const total = out.chapters.reduce((a, c) => a + c.segments.reduce((b, s) => b + est(s) + 0.7, 0) + (c.card ? 1.5 : 0), 0);
md += `| Narration length | ${fmt(total)} ${Object.keys(durs).length ? '(measured TTS)' : '(estimated at 2.3 words/s)'} |\n`;
md += `| Voice | Kokoro hm_omega (Hindi, male), speed ${video === "mobile" ? "1.05" : "0.95"}; captions in Latin-script Hinglish |\n\n`;
if (story.meta.privacy) md += `## Privacy rules for this recording\n\n${story.meta.privacy.map((p) => `- ${p}`).join('\n')}\n\n`;
if (story.seedDoc) md += `## Data to seed (before recording)\n\n${story.seedDoc}\n\n`;
md += `## Chapters\n\n| # | Chapter | Target | Narration |\n|---|---|---|---|\n`;
out.chapters.forEach((c, i) => {
  const d = c.segments.reduce((b, s) => b + est(s) + 0.7, 0) + (c.card ? 1.5 : 0);
  md += `| ${i} | ${c.title} | ${c.target ?? '—'} | ${fmt(d)} |\n`;
});
md += '\n';
for (const c of out.chapters) {
  md += `## ${c.id} · ${c.title}${c.target ? ` (target ${c.target})` : ''}\n\n`;
  if (c.card) md += `**Title card:** ${c.card.kicker ? `${c.card.kicker} — ` : ''}**${c.card.title}**${c.card.sub ? ` · ${c.card.sub}` : ''}\n\n`;
  if (c.problem) md += `- **Problem:** ${c.problem}\n`;
  if (c.feature) md += `- **Feature:** ${c.feature}\n`;
  if (c.steps.length) md += `- **UI steps:**\n${c.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}\n`;
  if (c.benefit) md += `- **Result / benefit:** ${c.benefit}\n`;
  md += `\n| Seg | On | Caption (Hinglish, on screen) | Voice text (TTS, Devanagari) | s |\n|---|---|---|---|---|\n`;
  for (const s of c.segments) md += `| ${s.id} | ${s.onCard ? 'card' : 'screen'} | ${s.cap.replace(/\|/g, '/')} | ${s.say.replace(/\|/g, '/')} | ${est(s).toFixed(1)} |\n`;
  md += '\n';
}
mkdirSync(`${ROOT}/scripts`, { recursive: true });
writeFileSync(`${ROOT}/scripts/${video}.md`, md);
console.log(`${video}: ${out.chapters.length} chapters, ${out.chapters.reduce((a, c) => a + c.segments.length, 0)} segments, ~${fmt(total)}`);
