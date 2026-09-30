// node record.mjs <video> [--dry] [--only=m04,m05]
//   --dry : no narration waits, one screenshot per segment (fast rehearsal of the actions)
import { runStory } from './lib.mjs';
const [video, ...rest] = process.argv.slice(2);
const dry = rest.includes('--dry');
const only = (rest.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const story = await import(`./stories/${video}.mjs`);
const rec = await runStory(story, { dry, only: only.length ? only : null });
process.exit(rec.leaks.some((l) => l.kind === 'password' || l.kind === 'email') ? 3 : 0);
