/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { en, hi } from 'src/tests/allMessages';

import { faqIds } from './faq';
import { FEATURE_CLIPS } from './media';
import { CAN_DO_LINES, CORE_IDS, LANDING_MODULES, type ModuleStatus } from './modules';

/**
 * `modules.ts` is the one table the landing page's modules come from. These
 * tests keep it honest (CR-2026-09-29-PLATFORM-D):
 *  - its internal `status` may not disagree with the vision doc's module map,
 *    where a status changes only through a CR — the pre-launch check reads it;
 *  - every module has the same copy, in both languages, so every card is the
 *    same card; and
 *  - the order is the owner's.
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

  /**
   * Owner, 29 Sep: these five, in this order. Coaching & tuition was added
   * and then withdrawn the same day ("I need library mgmt system, not
   * coaching"); it is on neither the vision map nor the page.
   */
  it('lists the five modules in the owner\'s order, and no coaching', () => {
    expect(LANDING_MODULES.map((module) => module.id)).toEqual(['shop', 'lending', 'library', 'gym', 'hotel']);
    expect(LANDING_MODULES.map((module) => module.visionGroup)).not.toContain('Coaching & tuition');
    expect(Object.keys(enMessages).filter((key) => key.startsWith('landing.module.coaching.'))).toEqual([]);
    expect(Object.keys(hiMessages).filter((key) => key.startsWith('landing.module.coaching.'))).toEqual([]);
  });

  it('has every module and core piece named in both languages, with the same lines each', () => {
    const keys = [
      'landing.modules.canDo',
      'landing.modules.buildsOn',
      ...CORE_IDS.flatMap((id) => [`landing.core.${id}`, `landing.core.${id}.short`]),
      ...LANDING_MODULES.flatMap((module) => [
        ...['name', 'audience', 'purpose', 'keeps'].map((part) => `landing.module.${module.id}.${part}`),
        ...CAN_DO_LINES.map((n) => `landing.module.${module.id}.i.${n}`),
      ]),
    ];
    keys.forEach((key) => {
      expect({ key, en: !!enMessages[key], hi: !!hiMessages[key] }).toEqual({ key, en: true, hi: true });
    });
    LANDING_MODULES.forEach((module) => {
      expect(enMessages[`landing.module.${module.id}.i.${CAN_DO_LINES.length + 1}`]).toBeUndefined();
    });
  });

  /**
   * `media` is the one switch that gives a module its recordings. Today only
   * Shop & billing has real ones, and it uses a clip the page already ships
   * (with its alt text in both languages); a clip that is not one of ours
   * would be an invented screen.
   */
  it('gives media only to a module with real recordings, from the landing manifest', () => {
    const known = Object.values(FEATURE_CLIPS).flatMap((clips) => [clips.desktop, clips.mobile]);
    expect(LANDING_MODULES.filter((module) => module.media).map((module) => module.id)).toEqual(['shop']);
    LANDING_MODULES.forEach((module) => {
      if (!module.media) return;
      expect(module.status).toBe('live');
      expect(known).toContain(module.media.clip);
      expect(enMessages[module.media.altKey]).toBeTruthy();
      expect(hiMessages[module.media.altKey]).toBeTruthy();
    });
  });

  /** The FAQ's "which modules are there" names every module, in both languages. */
  it('names every module in the "which modules" answer, in both languages', () => {
    expect(faqIds(false)).toContain('modules');
    LANDING_MODULES.forEach((module) => {
      expect(enMessages['landing.faq.modules.a']).toContain(enMessages[`landing.module.${module.id}.name`]);
      expect(hiMessages['landing.faq.modules.a']).toContain(hiMessages[`landing.module.${module.id}.name`]);
    });
  });
});
