/**
 * Part 19 §19.2.5 — THE barrel. Features import only from
 * `modules/DigiKhaato/design-system`… in BrandHub's tree; here the design
 * system is shared across modules, so the import path is
 * `src/design-system` and never a deep path (R-IM-3). This is what lets a
 * component be split into several files later without touching a feature.
 *
 * Sprint 0 exported design-system wave 0 (Part 32 S0-56). Sprint 1 adds
 * wave 1 (Part 32 §32.4.4) — the form anatomy, the auth-screen controls, the
 * overlays and the wizard's stepper. Waves 2–3 add lines here and nothing else.
 *
 * Wave 1, as shipped, differs from §32.4.4's list in two ways, both recorded in
 * the sprint report: `UbMoneyInput` and `UbDateInput` are deferred with
 * `UbFileUpload`, `UbPercentInput` and `UbQuantityInput`, because no Sprint 1
 * screen takes money or a date; and `UbDrawer` is deferred for the same reason
 * (PLT-02's change-password drawer lives on `/profile`, which is PLT-07's
 * screen in Sprint 2). `UbTextInput`, `UbOtpInput`, `UbSelect`, `UbRadioGroup`,
 * `UbCheckbox` and `UbProgress` are additions the Sprint 1 screens do need.
 */

// ── Wave 2 — layout and typography (§23.3) ───────────────────────────────────
/**
 * The primitives that replace raw JSX host elements in feature code, matching
 * how BrandHub's Customer module is written: `BHBox`, `BHGrid`, `BHTypography`,
 * `BHDivider`, `BHAvatar`, `BHListItemText` and `BHHyperLink` there; `UbBox`,
 * `UbStack`, `UbGrid`, `UbText`, `UbDivider`, `UbSpacer`, `UbAvatar`,
 * `UbListItemText` and `UbLink` here.
 *
 * `react/forbid-elements` (eslint.config.mjs) is what keeps them in use: a raw
 * `<div>`, `<span>`, `<h1>` or `<p>` under `src/modules/**` or `app/**` is a
 * build failure, and `src/design-system/**` is the one exempt zone because it
 * is where these components legitimately render host elements.
 */
export { UbAvatar } from './UbAvatar';
export type { UbAvatarProps, UbAvatarSize, UbAvatarTone } from './UbAvatar';

export { UbBox } from './UbBox';
export type { UbBoxProps } from './UbBox';

export { UbDivider } from './UbDivider';
export type { UbDividerOrientation, UbDividerProps } from './UbDivider';

export { UbGrid } from './UbGrid';
export type { UbGridColumns, UbGridProps, UbGridResponsiveColumns } from './UbGrid';

export { UbLink } from './UbLink';
export type { UbLinkProps } from './UbLink';

/**
 * CR-2026-09-19-D — the brand mark. It sits in the layout block because that is
 * what it is: the first thing in a rail, a page header or an auth column.
 */
export { UbLogo } from './UbLogo';
export type { UbLogoProps, UbLogoSize, UbLogoTone, UbLogoVariant } from './UbLogo';

export { UbListItemText } from './UbListItemText';
export type { UbListItemTextProps } from './UbListItemText';

export { UbPressable } from './UbPressable';
export type { UbPressableProps } from './UbPressable';

export { UbSpacer } from './UbSpacer';
export type { UbSpacerAxis, UbSpacerProps } from './UbSpacer';

export { UbStack } from './UbStack';
export type { UbStackAlign, UbStackDirection, UbStackJustify, UbStackProps } from './UbStack';

export { UbText } from './UbText';
export type { UbTextProps } from './UbText';

/** The shared scales, so a feature names a tier rather than restating a class. */
export { UB_GAP, UB_TEXT_ALIGN, UB_TEXT_TONE, UB_TEXT_VARIANT } from './scale';
export type { UbAlign, UbSpace, UbTextTone, UbTextVariant } from './scale';

// ── Wave 0 ───────────────────────────────────────────────────────────────────
export { UbAmount } from './UbAmount';
export type { UbAmountProps, UbAmountSign, UbAmountTone } from './UbAmount';

export { UbCard } from './UbCard';
export type { UbCardProps } from './UbCard';

export { UbEmptyState } from './UbEmptyState';
export type { UbEmptyStateProps, UbEmptyStateVariant } from './UbEmptyState';

export { UbPageHeader } from './UbPageHeader';
export type { UbPageHeaderProps, UbPageHeaderWidth } from './UbPageHeader';

export { UbPageShell } from './UbPageShell';
export type { UbPageShellProps, UbPageShellWidth } from './UbPageShell';

export { UbPageSkeleton, UbSkeleton } from './UbSkeleton';
export type { UbSkeletonProps, UbSkeletonVariant } from './UbSkeleton';

export { UbSnackbar } from './UbSnackbar';
export type { UbSnackbarMessage, UbSnackbarProps, UbSnackbarSeverity } from './UbSnackbar';

export { UbStatusBadge } from './UbStatusBadge';
export type { UbStatusBadgeProps, UbStatusBadgeTone } from './UbStatusBadge';

export { UbStatusBanner } from './UbStatusBanner';
export type { UbStatusBannerProps, UbStatusBannerTone } from './UbStatusBanner';

// ── Wave 1 — the form anatomy (§19.5.4) ──────────────────────────────────────
export { UbForm } from './UbForm';
export type { UbFormProps } from './UbForm';

export { UbField } from './UbField';
export type { UbFieldProps, UbFieldRenderProps } from './UbField';

export { UbFieldError } from './UbFieldError';
export type { UbFieldErrorProps } from './UbFieldError';

export { UbInputHint } from './UbInputHint';
export type { UbInputHintProps } from './UbInputHint';

// ── Wave 1 — controls ────────────────────────────────────────────────────────
export { UbButton } from './UbButton';
export type { UbButtonProps, UbButtonSize, UbButtonVariant } from './UbButton';

export { UbCheckbox } from './UbCheckbox';
export type { UbCheckboxProps } from './UbCheckbox';

/**
 * CR-2026-09-19-A — retained for the backlogged OTP flow; no screen imports it
 * at MVP. See the header of `UbOtpInput.tsx`.
 */
export { OTP_LENGTH, UbOtpInput } from './UbOtpInput';
export type { UbOtpInputProps } from './UbOtpInput';

export {
  IN_DIAL_CODE,
  IN_MOBILE_DIGITS,
  toE164,
  toNationalDigits,
  UbPhoneInput,
} from './UbPhoneInput';
export type { UbPhoneInputProps } from './UbPhoneInput';

export { progressTone, UbProgress, usagePercent } from './UbProgress';
export type { UbProgressProps } from './UbProgress';

export { UbRadioGroup } from './UbRadioGroup';
export type { UbRadioGroupProps } from './UbRadioGroup';

export { UbSelect } from './UbSelect';
export type { UbSelectOption, UbSelectProps } from './UbSelect';

export { UbTextInput } from './UbTextInput';
export type { UbTextInputProps } from './UbTextInput';

// ── Wave 1 — structure and overlays ──────────────────────────────────────────
export { UbConfirmDialog } from './UbConfirmDialog';
export type { UbConfirmDialogProps } from './UbConfirmDialog';

export { UbDialog } from './UbDialog';
export type { UbDialogProps } from './UbDialog';

export { UbStepper } from './UbStepper';
export type { UbStepperProps, UbStepperStep } from './UbStepper';

export { UbTabs } from './UbTabs';
export type { UbTabsProps } from './UbTabs';

/**
 * Re-exported because `UbTabs` and `UbRadioGroup` take them by value and a
 * feature must not reach into `src/design-system/primitives` to name a type
 * (R-IM-3).
 */
export type { MLRadioOption, MLTabDescriptor } from './primitives';
