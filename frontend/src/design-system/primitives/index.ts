/* =============================================================================
 * ⚠️  STAND-IN FOR `ml-uikit` — REPLACE THIS FILE'S BODY, NOTHING ELSE.
 * =============================================================================
 *
 * Part 23 §23.1 makes `ml-uikit` (Metis Labs, shadcn/Radix-based) the primitive
 * layer, and Part 32 S0-52 installs it from the internal registry on day one.
 * That registry is not reachable from this build environment, so the `ML*`
 * primitives the Sprint 0 wave actually uses are implemented locally in
 * ./mlPrimitives.tsx and re-exported here.
 *
 * THE SWAP IS THIS FILE. Every `Ub*` component imports its primitives from
 * 'src/design-system/primitives' and never from a deep path, so replacing the
 * two lines below with
 *
 *     export { MLCard, MLCardContent, MLCardHeader, MLBadge, MLAlert,
 *              MLAlertTitle, MLAlertDescription, MLSkeleton, MLEmpty,
 *              MLEmptyTitle, MLEmptyDescription, MLToaster, MLButton,
 *              MLSpinner, MLSeparator } from 'ml-uikit';
 *
 * (plus the `@import 'ml-uikit/dist/style.css'` line already marked in
 * app/globals.css and the ml-uikit `content` glob already marked in
 * tailwind.config.js) is the whole of the migration. No `Ub*` file changes.
 *
 * The stand-ins are deliberately minimal: they carry the token-backed classes
 * and the ARIA roles the real primitives carry, and nothing else. They are not
 * a fork of ml-uikit and must never grow product behaviour — that belongs in
 * the `Ub*` wrapper above them (§19.8.5).
 */
export {
  MLAlert,
  MLAlertDescription,
  MLAlertTitle,
  MLBadge,
  MLButton,
  MLCard,
  MLCardContent,
  MLCardHeader,
  MLEmpty,
  MLEmptyDescription,
  MLEmptyTitle,
  MLSeparator,
  MLSkeleton,
  MLSpinner,
  MLToaster,
} from './mlPrimitives';

export type {
  MLAlertProps,
  MLBadgeProps,
  MLButtonProps,
  MLCardProps,
  MLEmptyProps,
  MLSkeletonProps,
  MLToasterProps,
} from './mlPrimitives';
