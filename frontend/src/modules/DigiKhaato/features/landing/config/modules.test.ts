/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { en, hi } from 'src/tests/allMessages';

import {
  CORE_IDS,
  LANDING_MODULES,
  LIVE_MODULES,
  PROBLEM_LINES,
  STATUS_LABEL_KEY,
  UPCOMING_MODULES,
  type ModuleStatus,
} from './modules';

/**
 * `modules.ts` is the one switch for what the landing page says about each
 * module. These tests keep the switch honest in both directions:
 *  - it may not disagree with the vision doc's module map, where a status
 *    changes only through a CR; and
 *  - the copy may not disagree with it. A module flipped to live whose card
 *    still says "planned", or a count line that still says "four more
 *    planned" after one launches, fails here.
 */
const enMessages = en as Record<string, string>;
const hiMessages = hi as Record<string, string>;

/** Reads `| **Group** … | … | **Status** … |` rows from the vision doc's §2 table. */
const visionStatuses = (): Map<string, ModuleStatus> => {
  const doc = readFileSync(join(process.cwd(), '..', 'docs/platform/00-platform-vision.md'), 'utf8');
  const section = doc.slice(doc.indexOf('## 2. Module map'), doc.indexOf('## 3.'));
  const rows = new Map<string, ModuleStatus>();
  section.split('\n').forEach((line) => {
    const cells = line.split('|').map((cell) => cell.trim());
    const group = /^\*\*(.+?)\*\*/.exec(cells[1] ?? '')?.[1];
    const status = (cells[3] ?? '').toLowerCase();
    if (!group) return;
    if (status.startsWith('**live**')) rows.set(group, 'live');
    else if (status.startsWith('**in development**')) rows.set(group, 'in_development');
    else if (status.startsWith('**planned**')) rows.set(group, 'planned');
  });
  return rows;
};

describe('the landing page module config', () => {
  it('agrees with the module map in docs/platform/00-platform-vision.md', () => {
    const vision = visionStatuses();

    expect(vision.get('Core')).toBe('live');
    LANDING_MODULES.forEach((module) => {
      expect({ module: module.id, status: vision.get(module.visionGroup) }).toEqual({
        module: module.id,
        status: module.status,
      });
    });
  });

  it('builds every module on known core pieces only', () => {
    LANDING_MODULES.forEach((module) => {
      expect(module.buildsOn.length).toBeGreaterThan(0);
      module.buildsOn.forEach((id) => expect(CORE_IDS).toContain(id));
    });
  });

  it('has every module and core piece named in both languages', () => {
    const keys = [
      ...Object.values(STATUS_LABEL_KEY),
      ...CORE_IDS.flatMap((id) => [`landing.core.${id}`, `landing.core.${id}.short`]),
      ...LANDING_MODULES.flatMap((module) =>
        ['name', 'audience', 'purpose', 'keeps'].map((part) => `landing.module.${module.id}.${part}`)
      ),
      ...UPCOMING_MODULES.flatMap((module) =>
        PROBLEM_LINES.map((n) => `landing.module.${module.id}.problem.${n}`)
      ),
    ];
    keys.forEach((key) => {
      expect({ key, en: !!enMessages[key], hi: !!hiMessages[key] }).toEqual({ key, en: true, hi: true });
    });
  });

  /** The status chip says the config's word, never a synonym for "available". */
  it('labels the statuses Live, In development and Planned — no "Soon"', () => {
    expect(enMessages[STATUS_LABEL_KEY.live]).toBe('Live');
    expect(enMessages[STATUS_LABEL_KEY.in_development]).toBe('In development');
    expect(enMessages[STATUS_LABEL_KEY.planned]).toBe('Planned');
    Object.values(STATUS_LABEL_KEY).forEach((key) => {
      expect(enMessages[key]).not.toMatch(/soon|coming/i);
      expect(hiMessages[key]).not.toMatch(/जल्द/u);
    });
  });

  it('never describes an upcoming module as available', () => {
    UPCOMING_MODULES.forEach((module) => {
      Object.keys(enMessages)
        .filter((key) => key.startsWith(`landing.module.${module.id}.`))
        .forEach((key) => {
          expect({ key, text: enMessages[key] }).not.toEqual({
            key,
            text: expect.stringMatching(/\b(live|available|now|today|start free|sign up)\b/i),
          });
          expect({ key, text: hiMessages[key] }).not.toEqual({
            key,
            text: expect.stringMatching(/चालू|उपलब्ध|अभी शुरू|आज से/u),
          });
        });
    });
  });

  /** A live module lists what is in it; an upcoming one lists the problems instead. */
  it('gives a live module its feature lines and an upcoming one none', () => {
    LIVE_MODULES.forEach((module) => {
      expect(enMessages[`landing.module.${module.id}.i.1`]).toBeTruthy();
    });
    UPCOMING_MODULES.forEach((module) => {
      expect(enMessages[`landing.module.${module.id}.i.1`]).toBeUndefined();
    });
  });

  /** "One module today. Four more planned." is a COUNT of this file's rows. */
  it('counts the live and upcoming modules in the section heading correctly', () => {
    const EN = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
    const HI = ['कोई', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह'];
    const enLine = enMessages['landing.modules.key']?.toLowerCase() ?? '';
    const hiLine = hiMessages['landing.modules.key'] ?? '';

    expect(enLine).toContain(`${EN[LIVE_MODULES.length]} module`);
    expect(enLine).toContain(`${EN[UPCOMING_MODULES.length]} more planned`);
    expect(hiLine).toContain(`${HI[LIVE_MODULES.length]} मॉड्यूल`);
    expect(hiLine).toContain(`${HI[UPCOMING_MODULES.length]} और योजना में`);
  });

  /** The FAQ's "which modules can I use today" names every module, and says which are planned. */
  it('names every module in the "which modules today" answer, in both languages', () => {
    LANDING_MODULES.forEach((module) => {
      expect(enMessages['landing.faq.modules.a']).toContain(enMessages[`landing.module.${module.id}.name`]);
      expect(hiMessages['landing.faq.modules.a']).toContain(hiMessages[`landing.module.${module.id}.name`]);
    });
  });
});
