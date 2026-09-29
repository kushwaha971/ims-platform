/**
 * The platform's modules as the landing page shows them. This is the ONE place
 * a module's public status is written down (00-platform-vision.md §4, "module
 * status comes from one config file, so a module switches to live in one
 * line").
 *
 * Every surface that names a module reads it from here: the hero's badge, the
 * module map, the module cards, "Who it's for" and the FAQ. So a status that
 * changes here changes everywhere, and a surface cannot drift.
 *
 * The rules each status carries, enforced by `LandingPage.test.tsx` and
 * `unbuiltFeatureCopy.test.ts`:
 *  - `live`: the module's real screens exist (docs/platform/01-current-capabilities.md).
 *    Only a live module gets recordings, a demo and "Start free".
 *  - `in_development` and `planned`: a status chip, what the module is for,
 *    the problems it is planned to address and the core it builds on. No
 *    screenshot, video, demo, date or CTA. Its words (lender, library,
 *    gym, room…) may render only inside an element marked
 *    `data-module-status` with that status.
 *  - The statuses here must equal the module map in
 *    `docs/platform/00-platform-vision.md` §2, where a status changes only
 *    through a CR. A test reads that table.
 *
 * Copy lives in the landing catalogue under `landing.module.<id>.*`. Icons are
 * chosen in the component, so this file imports nothing and costs the route
 * nothing but the table.
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

export interface LandingModule {
  readonly id: LandingModuleId;
  /** The row this module is in the vision doc's §2 table, by its group name. */
  readonly visionGroup: string;
  readonly status: ModuleStatus;
  /** The core pieces the module is built on (live) or planned to build on. */
  readonly buildsOn: readonly CoreId[];
}

export const LANDING_MODULES: readonly LandingModule[] = [
  {
    id: 'shop',
    visionGroup: 'Shop & billing',
    status: 'live',
    buildsOn: ['people', 'money', 'payments', 'documents', 'reminders', 'reports', 'team', 'csv'],
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
];

export const isAvailable = (module: LandingModule): boolean => module.status === 'live';

export const LIVE_MODULES = LANDING_MODULES.filter(isAvailable);
export const UPCOMING_MODULES = LANDING_MODULES.filter((module) => !isAvailable(module));

/** Message id of a status's chip label. */
export const STATUS_LABEL_KEY: Readonly<Record<ModuleStatus, string>> = {
  live: 'landing.module.status.live',
  in_development: 'landing.module.status.in_development',
  planned: 'landing.module.status.planned',
};

/** The number of problem lines each upcoming module's card carries. */
export const PROBLEM_LINES = [1, 2, 3] as const;
