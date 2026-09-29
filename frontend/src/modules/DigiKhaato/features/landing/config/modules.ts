import { FEATURE_CLIPS, type LandingClip } from './media';

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
 *    one line is the whole change.
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

export type LandingModuleId = 'shop' | 'lending' | 'library' | 'gym' | 'hotel' | 'coaching';

/**
 * A module's recording: a DESKTOP loop (16:10) shown in a browser frame on
 * every width. One variant only, so a card never downloads two, and its alt
 * text is a catalogue key because it has to be in Hindi too.
 */
export interface ModuleMedia {
  readonly clip: LandingClip;
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
    media: { clip: FEATURE_CLIPS.bill.desktop, altKey: 'landing.uc.bill.alt' },
  },
  {
    id: 'lending',
    visionGroup: 'Lending & collections',
    status: 'planned',
    buildsOn: ['people', 'money', 'payments', 'reminders', 'documents', 'reports'],
  },
  {
    id: 'library',
    visionGroup: 'Library',
    status: 'planned',
    buildsOn: ['people', 'payments', 'reminders', 'reports', 'csv'],
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
  {
    id: 'coaching',
    visionGroup: 'Coaching & tuition',
    status: 'planned',
    buildsOn: ['people', 'money', 'payments', 'reminders', 'documents', 'reports'],
  },
];

/** The "What you can do" lines every module's card carries: `landing.module.<id>.i.<n>`. */
export const CAN_DO_LINES = [1, 2, 3, 4] as const;
