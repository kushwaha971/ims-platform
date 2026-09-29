'use client';

import { memo } from 'react';

import {
  ArrowLeftRight,
  BarChart3,
  BedDouble,
  BellRing,
  Dumbbell,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Languages,
  LibraryBig,
  ShieldCheck,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { UbBox, UbStatusBadge, UbText, type UbStatusBadgeTone } from 'src/design-system';
import { cn } from 'src/utils/cn';

import {
  STATUS_LABEL_KEY,
  type CoreId,
  type LandingModuleId,
  type ModuleStatus,
} from '../config/modules';

/**
 * The small pieces the platform map, the module cards and "Who it's for" share:
 * one icon per module and per core piece, the status chip, and the core chip.
 * Kept together so a module looks the same wherever it appears on the page.
 */
export const MODULE_ICON: Readonly<Record<LandingModuleId, LucideIcon>> = {
  shop: Store,
  lending: HandCoins,
  library: LibraryBig,
  gym: Dumbbell,
  hotel: BedDouble,
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

const STATUS_TONE: Readonly<Record<ModuleStatus, UbStatusBadgeTone>> = {
  live: 'success',
  in_development: 'warning',
  planned: 'neutral',
};

/**
 * The status as a word in a badge (Part 23 §23.2.4 rule 3: never a dot alone).
 * Live has a filled dot, anything else a hollow ring, so the two read apart in
 * greyscale as well as in colour.
 */
function ModuleStatusChipBase({
  status,
  t,
  className,
}: Readonly<{ status: ModuleStatus; t: (id: string) => string; className?: string }>) {
  return (
    <UbStatusBadge
      tone={STATUS_TONE[status]}
      label={t(STATUS_LABEL_KEY[status])}
      className={cn('shrink-0', className)}
      icon={
        <UbBox
          as="span"
          aria-hidden
          data-testid={`landing-status-${status}`}
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            status === 'live' ? 'bg-success-bright' : 'border border-current'
          )}
        />
      }
    />
  );
}

ModuleStatusChipBase.displayName = 'ModuleStatusChip';
export const ModuleStatusChip = memo(ModuleStatusChipBase);

/**
 * One core piece as a quiet pill with its icon. `size="sm"` is the "Builds on"
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

/**
 * A module's icon in its tile. Live: a filled accent tile. Anything else: a
 * dashed outline and a muted icon — the drawing itself says "not built yet",
 * which is the only illustration an upcoming module gets.
 */
function ModuleIconTileBase({
  id,
  status,
  size = 'md',
}: Readonly<{ id: LandingModuleId; status: ModuleStatus; size?: 'md' | 'lg' }>) {
  const Icon = MODULE_ICON[id];
  return (
    <UbBox
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center',
        size === 'lg' ? 'h-14 w-14 rounded-[18px]' : 'h-11 w-11 rounded-[14px]',
        status === 'live'
          ? 'bg-accent text-text-inverse shadow-[0_10px_24px_-12px_var(--device-glow)]'
          : 'border border-dashed border-border-strong bg-surface-subtle text-text-tertiary'
      )}
    >
      <Icon className={size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'} strokeWidth={1.75} />
    </UbBox>
  );
}

ModuleIconTileBase.displayName = 'ModuleIconTile';
export const ModuleIconTile = memo(ModuleIconTileBase);
