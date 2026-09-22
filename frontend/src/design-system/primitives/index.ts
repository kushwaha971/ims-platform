/* =============================================================================
 * ⚠️  STAND-IN FOR `ml-uikit` — REPLACE THIS FILE'S BODY, NOTHING ELSE.
 * =============================================================================
 *
 * Part 23 §23.1 makes `ml-uikit` (Metis Labs, shadcn/Radix-based) the primitive
 * layer, and Part 32 S0-52 installs it from the internal registry on day one.
 * That registry is not reachable from this build environment, so the `ML*`
 * primitives the waves actually use are implemented locally in
 * ./mlPrimitives.tsx (wave 0), ./mlFormPrimitives.tsx and
 * ./mlOverlayPrimitives.tsx (wave 1), ./mlLayoutPrimitives.tsx (wave 2) and
 * ./mlToastPrimitives.tsx (CR-2026-09-19-E) and re-exported here.
 *
 * THE SWAP IS STILL THIS FILE. Every `Ub*` component imports its primitives
 * from 'src/design-system/primitives' and never from a deep path, so replacing
 * the export blocks below with
 *
 *     export { MLCard, MLCardContent, MLCardHeader, MLBadge, MLAlert,
 *              MLAlertTitle, MLAlertDescription, MLSkeleton, MLEmpty,
 *              MLEmptyTitle, MLEmptyDescription, MLToast, MLToaster, MLButton,
 *              MLSpinner, MLSeparator, MLInput, MLTextarea, MLSelect,
 *              MLCheckbox, MLRadioGroup, MLToggleGroup, MLTabs, MLProgress,
 *              MLIconButton, MLDialog, MLDialogTitle, MLDialogDescription,
 *              MLDialogFooter, MLMenu, MLMenuItem, MLMenuLabel } from 'ml-uikit';
 *
 * (plus the `@import 'ml-uikit/dist/style.css'` line already marked in
 * app/globals.css and the ml-uikit `content` glob already marked in
 * tailwind.config.js) is the whole of the migration. No `Ub*` file changes.
 *
 * The stand-ins are deliberately minimal: they carry the token-backed classes,
 * the ARIA roles and the keyboard behaviour the real primitives carry, and
 * nothing else. They are not a fork of ml-uikit and must never grow product
 * behaviour — that belongs in the `Ub*` wrapper above them (§19.8.5).
 */

// ── Layout (wave 2 — Part 23 §23.3, the BrandHub `BHBox` seat) ───────────────
export { ML_BOX_DEFAULT_ELEMENT, MLBox } from './mlLayoutPrimitives';

export type { MLPolymorphicProps } from './mlLayoutPrimitives';

// ── Wave 0 ───────────────────────────────────────────────────────────────────
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
} from './mlPrimitives';

export type {
  MLAlertProps,
  MLBadgeProps,
  MLButtonProps,
  MLButtonSize,
  MLButtonVariant,
  MLCardProps,
  MLEmptyProps,
  MLSkeletonProps,
} from './mlPrimitives';

// ── Toasts (CR-2026-09-19-E — the single failure channel of §19.12.2) ───────
export { MLToast, MLToaster } from './mlToastPrimitives';

export type {
  MLToastPoliteness,
  MLToastProps,
  MLToastVariant,
  MLToasterProps,
} from './mlToastPrimitives';

// ── Wave 1 — forms ───────────────────────────────────────────────────────────
export {
  ML_CONTROL_BASE,
  ML_CONTROL_TONE,
  MLCheckbox,
  MLIconButton,
  MLInput,
  MLProgress,
  MLRadioGroup,
  MLSelect as MLNativeSelect,
  MLTabs,
  MLTextarea,
  MLToggleGroup,
} from './mlFormPrimitives';

export type {
  MLCheckboxProps,
  MLIconButtonProps,
  MLInputProps,
  MLProgressProps,
  MLRadioGroupProps,
  MLRadioOption,
  MLSelectProps as MLNativeSelectProps,
  MLTabDescriptor,
  MLTabsProps,
  MLTextareaProps,
  MLToggleGroupProps,
  MLToggleOption,
} from './mlFormPrimitives';

// ── Wave 1 — overlays ────────────────────────────────────────────────────────
export {
  MLDialog,
  MLDialogDescription,
  MLDialogBody,
  MLDialogFooter,
  MLDialogHeader,
  MLDialogTitle,
  MLMenu,
  MLMenuItem,
  MLMenuLabel,
} from './mlOverlayPrimitives';

export type {
  MLDialogProps,
  MLDialogTitleProps,
  MLMenuItemProps,
  MLMenuProps,
} from './mlOverlayPrimitives';

/* ── The first real ml-uikit primitives ────────────────────────────────────
 *
 * The package is vendored at `frontend/vendor/ml-uikit` and wired in through
 * `package.json`'s `file:` dependency and the Tailwind content glob. Before
 * this, every `ML*` name in this directory resolved to a local stand-in,
 * because the internal registry that hosts the package is unreachable from the
 * build environment — so the stand-ins were honest about what they could not do
 * and three reported UI defects were downstream of exactly that.
 *
 * These are re-exported here rather than imported directly by feature code, so
 * the swap point stays this one file, exactly as the header describes.
 *
 * The local native `<select>` survives as `MLNativeSelect`. It is not dead: on a
 * 2 GB Android phone the platform picker is genuinely the better control for a
 * long closed list, and §23.3's reasoning for it still stands. What it could
 * never be was a styled trigger with a positioned menu, which is what the design
 * asks for and what `MLSelect` now is.
 */
export {
  MLSelect,
  MLSelectContent,
  MLSelectGroup,
  MLSelectItem,
  MLSelectLabel,
  MLSelectSeparator,
  MLSelectTrigger,
  MLSelectValue,
  MLDrawer,
  MLDrawerClose,
  MLDrawerContent,
  MLDrawerDescription,
  MLDrawerFooter,
  MLDrawerHeader,
  MLDrawerOverlay,
  MLDrawerPortal,
  MLDrawerTitle,
  MLDrawerTrigger,
  MLPopover,
  MLPopoverContent,
  MLPopoverTrigger,
  MLCommand,
  MLCommandEmpty,
  MLCommandGroup,
  MLCommandInput,
  MLCommandItem,
  MLCommandList,
} from 'ml-uikit';
