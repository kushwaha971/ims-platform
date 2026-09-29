'use client';

import { memo } from 'react';

import {
  ArrowLeftRight,
  BarChart3,
  BedDouble,
  BellRing,
  BookCopy,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  ConciergeBell,
  Dumbbell,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  HandCoins,
  Hourglass,
  IdCard,
  KeyRound,
  Languages,
  LibraryBig,
  NotebookPen,
  Package,
  ReceiptIndianRupee,
  ReceiptText,
  RefreshCw,
  Route,
  ShieldCheck,
  Store,
  Undo2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { UbBox, UbDeviceFrame, UbText, UbVideo, type UbVideoLabels } from 'src/design-system';
import { cn } from 'src/utils/cn';

import type { CoreId, LandingModuleId, ModuleMedia } from '../config/modules';

/**
 * The pieces the platform map, the module cards and "Who it's for" share: one
 * icon per module and per core piece, the module's icon tile, the core chip,
 * and the card's STAGE — a recording when the module has one, an icon
 * illustration when it does not. Kept together so a module looks the same
 * wherever it appears on the page.
 *
 * Nothing here reads a module's status (CR-2026-09-29-PLATFORM-D): every
 * module is drawn the same way.
 */
export const MODULE_ICON: Readonly<Record<LandingModuleId, LucideIcon>> = {
  shop: Store,
  lending: HandCoins,
  library: LibraryBig,
  gym: Dumbbell,
  hotel: BedDouble,
  coaching: GraduationCap,
};

/**
 * The four things each module works with, drawn around its icon in the
 * illustration. Our own icon set only — no screenshot, no mock screen, no
 * figure — so the drawing can never be mistaken for the product's UI.
 */
export const MODULE_SCENE: Readonly<Record<LandingModuleId, readonly [LucideIcon, LucideIcon, LucideIcon, LucideIcon]>> = {
  shop: [ReceiptIndianRupee, Package, Users, Wallet],
  lending: [NotebookPen, CalendarClock, Route, ReceiptText],
  library: [BookCopy, IdCard, Undo2, Hourglass],
  gym: [IdCard, RefreshCw, CalendarCheck, ReceiptText],
  hotel: [CalendarRange, KeyRound, ConciergeBell, ReceiptText],
  coaching: [Users, CalendarCheck, Wallet, Undo2],
};

export const CORE_ICON: Readonly<Record<CoreId, LucideIcon>> = {
  people: Users,
  money: ArrowLeftRight,
  payments: Wallet,
  documents: FileText,
  reminders: BellRing,
  reports: BarChart3,
  team: ShieldCheck,
  language: Languages,
  csv: FileSpreadsheet,
};

/**
 * One core piece as a quiet pill with its icon. `size="sm"` is the "Built on"
 * row of a module card and uses the SHORT name ("Money", not "Money in and
 * out, and balances"), so six of them sit in two even rows instead of a ragged
 * stack that makes every card a different height.
 */
function CoreChipBase({
  id,
  t,
  size = 'md',
}: Readonly<{ id: CoreId; t: (id: string) => string; size?: 'sm' | 'md' }>) {
  const Icon = CORE_ICON[id];
  return (
    <UbText
      as="li"
      variant="inherit"
      className={cn(
        'inline-flex items-center gap-2 rounded-pill border border-border-hairline bg-surface-card text-text-secondary',
        size === 'md' ? 'px-3.5 py-2 ds-body-base-medium' : 'px-2.5 py-1 ds-body-s-medium'
      )}
    >
      <Icon aria-hidden className={cn('shrink-0 text-text-accent', size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
      {t(size === 'md' ? `landing.core.${id}` : `landing.core.${id}.short`)}
    </UbText>
  );
}

CoreChipBase.displayName = 'CoreChip';
export const CoreChip = memo(CoreChipBase);

/** A module's icon in its filled accent tile — the same for every module. */
function ModuleIconTileBase({ id, size = 'md' }: Readonly<{ id: LandingModuleId; size?: 'sm' | 'md' | 'lg' }>) {
  const Icon = MODULE_ICON[id];
  return (
    <UbBox
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center bg-accent text-text-inverse shadow-[0_10px_24px_-12px_var(--device-glow)]',
        size === 'lg' && 'h-14 w-14 rounded-[18px]',
        size === 'md' && 'h-11 w-11 rounded-[14px]',
        size === 'sm' && 'h-10 w-10 rounded-[12px]'
      )}
    >
      <Icon className={size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'} strokeWidth={1.75} />
    </UbBox>
  );
}

ModuleIconTileBase.displayName = 'ModuleIconTile';
export const ModuleIconTile = memo(ModuleIconTileBase);

/**
 * Where each of the four satellites sits, in percent of the stage: upper-left,
 * upper-right, lower-right, lower-left, pulled in unevenly so the drawing reads
 * as a constellation rather than a grid. The spokes are drawn to the same
 * points.
 */
const SATELLITE_AT: readonly (readonly [number, number])[] = [
  [17, 20],
  [78, 16],
  [84, 70],
  [22, 78],
];

/**
 * The illustration a module without recordings gets: its icon large at the
 * centre of a dotted field, a dashed orbit, and the four things it works with
 * (`MODULE_SCENE`) as small tiles on that orbit, each joined to the centre by a
 * hairline. Entirely decorative and `aria-hidden`: the card's words say what
 * the module does; this makes the card feel finished without pretending to be
 * a screen.
 */
function ModuleIllustration({ id }: Readonly<{ id: LandingModuleId }>) {
  const Icon = MODULE_ICON[id];
  return (
    <UbBox aria-hidden data-module-illustration className="absolute inset-0">
      {/* the dotted field, fading out towards the edges */}
      <UbBox className="absolute inset-0 bg-[radial-gradient(hsl(var(--border-strong)/0.55)_1px,transparent_1.2px)] [background-size:16px_16px] [mask-image:radial-gradient(75%_75%_at_50%_50%,black,transparent)]" />
      <UbBox className="absolute inset-0 bg-[radial-gradient(55%_60%_at_50%_50%,var(--accent-quiet),transparent_75%)]" />
      {/* spokes from the centre to each satellite */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {SATELLITE_AT.map(([x, y]) => (
          <line
            key={`${x}-${y}`}
            x1="50"
            y1="50"
            x2={x}
            y2={y}
            vectorEffect="non-scaling-stroke"
            className="stroke-accent-line"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        ))}
      </svg>
      {/* the orbit */}
      <UbBox className="absolute left-1/2 top-1/2 aspect-square w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-accent-line" />
      <UbBox className="absolute left-1/2 top-1/2 aspect-square w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-card/60 ring-1 ring-inset ring-accent-line" />
      {/* the module, at the centre */}
      <UbBox className="absolute left-1/2 top-1/2 flex h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[22px] bg-accent text-text-inverse shadow-[0_18px_40px_-14px_var(--device-glow)] transition-transform duration-base ease-standard group-hover:scale-105 sm:h-20 sm:w-20">
        <Icon className="h-9 w-9 sm:h-10 sm:w-10" strokeWidth={1.6} />
      </UbBox>
      {MODULE_SCENE[id].map((Satellite, index) => (
        <UbBox
          key={SATELLITE_AT[index]?.join('-')}
          style={{ left: `${SATELLITE_AT[index]?.[0]}%`, top: `${SATELLITE_AT[index]?.[1]}%` }}
          className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[14px] border border-border-hairline bg-surface-card text-text-accent shadow-[0_10px_24px_-16px_var(--device-glow)] sm:h-12 sm:w-12"
        >
          <Satellite className="h-5 w-5" strokeWidth={1.75} />
        </UbBox>
      ))}
    </UbBox>
  );
}

/**
 * The top of every module card: a fixed-ratio stage, so a row of cards lines
 * up whether each holds a recording or an illustration. With `media`, the
 * module's real desktop loop plays in a browser frame (the same `UbVideo`
 * rules as the rest of the page: poster first, sources only near the
 * viewport, paused offscreen, a pause control); without it, the illustration.
 * Giving a module its recordings is `media` in `config/modules.ts` and
 * nothing else.
 */
function ModuleStageBase({
  id,
  media,
  t,
  videoLabels,
}: Readonly<{
  id: LandingModuleId;
  media?: ModuleMedia;
  t: (id: string) => string;
  videoLabels: UbVideoLabels;
}>) {
  return (
    <UbBox
      data-module-stage={media ? 'media' : 'illustration'}
      className="relative aspect-[4/3] overflow-clip rounded-[18px] border border-border-hairline bg-surface-subtle"
    >
      {media ? (
        <UbBox className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(70%_70%_at_50%_40%,var(--accent-quiet),transparent_80%)] p-4 sm:p-5">
          <UbDeviceFrame variant="browser" url="yourkhata.com" className="w-full">
            <UbVideo {...media.clip} alt={t(media.altKey)} labels={videoLabels} />
          </UbDeviceFrame>
        </UbBox>
      ) : (
        <ModuleIllustration id={id} />
      )}
    </UbBox>
  );
}

ModuleStageBase.displayName = 'ModuleStage';
export const ModuleStage = memo(ModuleStageBase);
