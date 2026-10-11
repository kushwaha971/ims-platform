import { LANDING_HIDDEN_MODULES } from 'src/constants';

import { MODULE_CLIPS, type LandingClip } from './media';

/**
 * The platform's modules as the landing page shows them. Every surface that
 * names a module reads it from here — the module map, the module cards, "Who
 * it's for" and the FAQ's list — so adding a module, or giving one its
 * recordings, is a change to this table and the catalogue, never to a
 * component (CR-2026-09-29-PLATFORM-D).
 *
 * The owner's rules (docs/platform/00-platform-vision.md §4), each held by a
 * test in `LandingPage.test.tsx`, `modules.test.ts` or
 * `unbuiltFeatureCopy.test.ts`:
 *  - Every module is presented the same way, as part of the product. There is
 *    NO Live / Planned / In development label anywhere on the page.
 *  - `status` stays here for the build plan and for the pre-launch check
 *    (docs/platform/STATUS.md: before yourkhata.com is public, every module
 *    shown is live or the owner re-confirms the page). It must equal the
 *    module map in the vision doc §2, where it changes only through a CR, and
 *    the page renders NOTHING from it — no chip, no class, no attribute.
 *  - `media` is optional. With it, the card shows that recording in a browser
 *    frame; without it, the card shows an illustration drawn from our own
 *    icons. Never an invented screenshot, a mock UI or fake data: a module
 *    gets `media` when it has real recordings of its real screens, and that
 *    one line is the whole change. Lending and Library got theirs on 10 Oct
 *    2026, the day both were released (DEC-015): recordings of their real
 *    screens, from the demo book (`e2e/demo/`).
 *
 * Copy lives in the landing catalogue under `landing.module.<id>.*`; icons are
 * chosen in `LandingModuleParts.tsx`.
 */
export type ModuleStatus = 'live' | 'in_development' | 'planned';

/** The shared core, in the order the module map draws it. */
export const CORE_IDS = [
  'people',
  'money',
  'payments',
  'documents',
  'reminders',
  'reports',
  'team',
  'language',
  'csv',
] as const;
export type CoreId = (typeof CORE_IDS)[number];

export type LandingModuleId = 'shop' | 'lending' | 'library' | 'gym' | 'hotel';

/**
 * A module's recordings: the DESKTOP loop (16:10) in a browser frame from
 * `sm`, and the PHONE loop in a phone frame below it — the phone layout, not
 * the desktop picture shrunk. `UbVideo`'s `media` makes sure a visitor only
 * ever downloads the one their screen shows. The alt text is a catalogue key
 * because it has to be in Hindi too.
 */
export interface ModuleMedia {
  readonly clip: LandingClip;
  readonly mobileClip?: LandingClip;
  readonly altKey: string;
}

export interface LandingModule {
  readonly id: LandingModuleId;
  /** The row this module is in the vision doc's §2 table, by its group name. */
  readonly visionGroup: string;
  /** Internal only (see the header). Never rendered. */
  readonly status: ModuleStatus;
  /** The core pieces the module uses. */
  readonly buildsOn: readonly CoreId[];
  /** Real recordings of the module's screens, when it has them. */
  readonly media?: ModuleMedia;
}

export const LANDING_MODULES: readonly LandingModule[] = [
  {
    id: 'shop',
    visionGroup: 'Shop & billing',
    status: 'live',
    buildsOn: ['people', 'money', 'payments', 'documents', 'reminders', 'reports', 'team', 'csv'],
    media: {
      clip: MODULE_CLIPS.shop.desktop,
      mobileClip: MODULE_CLIPS.shop.mobile,
      altKey: 'landing.uc.bill.alt',
    },
  },
  {
    id: 'lending',
    visionGroup: 'Lending & collections',
    status: 'live',
    buildsOn: ['people', 'money', 'payments', 'reminders', 'documents', 'reports'],
    media: {
      clip: MODULE_CLIPS.lending.desktop,
      mobileClip: MODULE_CLIPS.lending.mobile,
      altKey: 'landing.module.lending.alt',
    },
  },
  {
    id: 'library',
    visionGroup: 'Library',
    status: 'live',
    buildsOn: ['people', 'payments', 'reminders', 'reports', 'csv'],
    media: {
      clip: MODULE_CLIPS.library.desktop,
      mobileClip: MODULE_CLIPS.library.mobile,
      altKey: 'landing.module.library.alt',
    },
  },
  {
    id: 'gym',
    visionGroup: 'Gym & fitness',
    status: 'planned',
    buildsOn: ['people', 'payments', 'reminders', 'documents', 'reports'],
  },
  {
    id: 'hotel',
    visionGroup: 'Hotel & stays',
    status: 'planned',
    buildsOn: ['people', 'money', 'payments', 'documents', 'reports', 'team'],
  },
];

/**
 * The modules the PUBLIC page shows: every module not named in
 * `LANDING_HIDDEN_MODULES` (src/constants.ts). Every landing surface that lists
 * modules reads THIS — the map, the cards, "Who it's for", the FAQ, the title
 * and the structured data — so hiding or showing a module is one configuration
 * value and no component changes. `LANDING_MODULES` stays the full table, for
 * the build plan and the tests that hold it to the vision document.
 */
export const visibleModules = (hidden: readonly string[]): readonly LandingModule[] =>
  LANDING_MODULES.filter((module) => !hidden.includes(module.id));

export const VISIBLE_MODULES: readonly LandingModule[] = visibleModules(LANDING_HIDDEN_MODULES);

/** True when the page shows every module — the copy that names all five applies. */
export const ALL_MODULES_VISIBLE: boolean = VISIBLE_MODULES.length === LANDING_MODULES.length;

/** The "What you can do" lines every module's card carries: `landing.module.<id>.i.<n>`. */
export const CAN_DO_LINES = [1, 2, 3, 4] as const;
