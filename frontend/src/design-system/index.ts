/**
 * Part 19 §19.2.5 — THE barrel. Features import only from
 * `modules/UdhaarBook/design-system`… in BrandHub's tree; here the design
 * system is shared across modules, so the import path is
 * `src/design-system` and never a deep path (R-IM-3). This is what lets a
 * component be split into several files later without touching a feature.
 *
 * Sprint 0 exports design-system wave 0 (Part 32 S0-56). Waves 1–3 add lines
 * here and nothing else.
 */
export { UbAmount } from './UbAmount';
export type { UbAmountProps, UbAmountSign, UbAmountTone } from './UbAmount';

export { UbCard } from './UbCard';
export type { UbCardProps } from './UbCard';

export { UbEmptyState } from './UbEmptyState';
export type { UbEmptyStateProps, UbEmptyStateVariant } from './UbEmptyState';

export { UbPageHeader } from './UbPageHeader';
export type { UbPageHeaderProps } from './UbPageHeader';

export { UbPageShell } from './UbPageShell';
export type { UbPageShellProps } from './UbPageShell';

export { UbPageSkeleton, UbSkeleton } from './UbSkeleton';
export type { UbSkeletonProps, UbSkeletonVariant } from './UbSkeleton';

export { UbSnackbar } from './UbSnackbar';
export type { UbSnackbarMessage, UbSnackbarProps, UbSnackbarSeverity } from './UbSnackbar';

export { UbStatusBadge } from './UbStatusBadge';
export type { UbStatusBadgeProps, UbStatusBadgeTone } from './UbStatusBadge';

export { UbStatusBanner } from './UbStatusBanner';
export type { UbStatusBannerProps, UbStatusBannerTone } from './UbStatusBanner';
