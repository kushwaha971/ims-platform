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
 * Wave 1, as shipped, differed from §32.4.4's list in two ways, both recorded
 * in the sprint report: `UbMoneyInput`, `UbDateInput` and `UbDrawer` were
 * deferred with `UbFileUpload`, `UbPercentInput` and `UbQuantityInput`, because
 * no Sprint 1 screen took money, a date or a form long enough to need a drawer.
 * `UbTextInput`, `UbOtpInput`, `UbSelect`, `UbRadioGroup`, `UbCheckbox` and
 * `UbProgress` are additions the Sprint 1 screens did need.
 *
 * **Sprint 3 / PTY-01 closes three of those deferrals.** The party form takes an
 * opening balance, a collection date and twenty-odd fields, so `UbMoneyInput`,
 * `UbDateInput` and `UbDrawer` are built below. `UbFileUpload`,
 * `UbPercentInput` and `UbQuantityInput` stay deferred — nothing yet uploads a
 * file, sets a rate or counts stock.
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

/**
 * CR-2026-09-19-G — anything that occupies the bottom of the viewport: the
 * wizard's sticky Continue bar, the `(auth)` page footer, `UbPageShell`'s
 * action row, and `UbBottomNav` when it lands. It publishes its own share of
 * that edge as `--ub-bottom-inset`, which is what keeps the global toast off
 * it. Layout block, because that is what it is.
 */
export { UbBottomBar } from './UbBottomBar';
export type { UbBottomBarElement, UbBottomBarProps } from './UbBottomBar';

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
export { UbTooltip } from './UbTooltip';
export type { UbTooltipProps, UbTooltipPlacement } from './UbTooltip';
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

export { UbRequestId, formatRequestReference } from './UbRequestId';
export type { UbRequestIdFields, UbRequestIdProps } from './UbRequestId';

export { UbPageHeader } from './UbPageHeader';
export type { UbPageHeaderProps, UbPageHeaderWidth } from './UbPageHeader';

export { UbPageShell } from './UbPageShell';
export type { UbPageShellProps, UbPageShellWidth } from './UbPageShell';

export { UbPageSkeleton, UbSkeleton } from './UbSkeleton';
export type { UbSkeletonProps, UbSkeletonVariant } from './UbSkeleton';

export { UB_SNACKBAR_AUTO_HIDE_MS, UbSnackbar } from './UbSnackbar';
export type { UbSnackbarProps, UbSnackbarSeverity } from './UbSnackbar';

export { UbStatusBadge } from './UbStatusBadge';
export type { UbStatusBadgeProps, UbStatusBadgeTone } from './UbStatusBadge';

export { UbSearchInput } from './UbSearchInput';
export type { UbSearchInputProps } from './UbSearchInput';
export { UbSectionHeading } from './UbSectionHeading';
export type { UbSectionHeadingProps } from './UbSectionHeading';
export { UbPanel, UbPanelSection } from './UbPanel';
export type { UbPanelProps, UbPanelSectionProps } from './UbPanel';
export { UbInfoRow } from './UbInfoRow';
export type { UbInfoRowProps, UbInfoRowVariant } from './UbInfoRow';
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

// ── PTY-02 — filter chips ────────────────────────────────────────────────────
// A toggle that says something about the list below it, and the group that
// gives a row of them a name. Extracted from the copy that was inline in
// `UbDateInput`'s quick choices once PTY-02 needed the same pill three more
// times.
export { UbFilterBar, UbFilterChip, UbFilterChipGroup } from './UbFilterChip';
export type { UbFilterBarProps, UbFilterChipGroupProps, UbFilterChipProps } from './UbFilterChip';

// ── Wave 1 — controls ────────────────────────────────────────────────────────
export { UbButton } from './UbButton';
export type { UbButtonProps, UbButtonSize, UbButtonVariant } from './UbButton';
export { UbActionLink } from './UbActionLink';
export type { UbActionLinkProps } from './UbActionLink';
export { UbChoiceChips } from './UbChoiceChips';
export type { UbChoiceChipOption, UbChoiceChipsProps } from './UbChoiceChips';

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

export { UbCombobox } from './UbCombobox';
export type { UbComboboxProps } from './UbCombobox';
export { UbNativeSelect } from './UbNativeSelect';
export type { UbNativeSelectProps } from './UbNativeSelect';
export { UbSelect } from './UbSelect';
export type { UbSelectOption, UbSelectProps } from './UbSelect';

export { UbDisclosure } from './UbDisclosure';
export type { UbDisclosureProps } from './UbDisclosure';
export { UbDrawer } from './UbDrawer';
export type { UbDrawerProps } from './UbDrawer';
export { UbMoneyInput, groupIndian, padDecimals, sanitiseAmount } from './UbMoneyInput';
export type { UbMoneyInputProps } from './UbMoneyInput';
export { UbDateInput, isoFinancialYearStart, isoToday } from './UbDateInput';
export type { UbDateInputProps, UbDateQuickChoice } from './UbDateInput';

export { UbPopover } from './UbPopover';
export type { UbPopoverProps } from './UbPopover';
export { UbSwitch } from './UbSwitch';
export type { UbSwitchProps } from './UbSwitch';
export { UbTextInput } from './UbTextInput';
export type { UbTextInputProps } from './UbTextInput';

/**
 * PTY-05 — a merchant's own labels. `UbTag` is the chip; `UbTagList` is the
 * fixed-height lane a list row reserves for it; `UbTokenInput` is the picker
 * that adds one, including one that does not exist yet.
 */
export { isUbTagColor, UB_TAG_COLORS, UbTag, UbTagList } from './UbTag';
export type { UbTagColor, UbTagListItem, UbTagListProps, UbTagProps } from './UbTag';
export { UbTokenInput } from './UbTokenInput';
export type { UbTokenInputOption, UbTokenInputProps } from './UbTokenInput';

// ── Wave 1 — structure and overlays ──────────────────────────────────────────
export { UbConfirmDialog } from './UbConfirmDialog';
export type { UbConfirmDialogProps } from './UbConfirmDialog';

export { UbDialog } from './UbDialog';
export type { UbDialogProps } from './UbDialog';

// ── Wave 3 — Sprint 3 §32.6.4 ────────────────────────────────────────────────
/**
 * `UbShareSheet` — NTF-03's one share surface: WhatsApp, SMS, copy and the
 * platform sheet, over `UbDialog` (no Radix popover — the khata route's bundle
 * gate refused one). The links it opens are built in `src/utils/share.ts`.
 * `UbDateRangePicker` — a period as presets plus a custom from/to, in a
 * `UbFilterBar`. `UbFab` — the floating action button, which clears the toast
 * through `useBottomInset`. `UbTimeline` and `UbPartyHeader` are NOT here, by
 * decision: each would have one caller (docs/DESIGN-SYSTEM.md §4).
 */
export { UbShareSheet } from './UbShareSheet';
export type { UbShareChannel, UbShareSheetLabels, UbShareSheetProps } from './UbShareSheet';
export { UbDateRangePicker } from './UbDateRangePicker';
export type {
  UbDateRangePickerLabels,
  UbDateRangePickerProps,
  UbDateRangePreset,
} from './UbDateRangePicker';
export { UbFab } from './UbFab';
export type { UbFabProps } from './UbFab';

export { UbStepper } from './UbStepper';
export type { UbStepperProps, UbStepperStep, UbStepperTone } from './UbStepper';

export { UbTabs } from './UbTabs';
export type { UbTabsProps } from './UbTabs';

/**
 * Re-exported because `UbTabs` and `UbRadioGroup` take them by value and a
 * feature must not reach into `src/design-system/primitives` to name a type
 * (R-IM-3).
 */
export type { MLRadioOption, MLTabDescriptor } from './primitives';

// ── UbDataGrid — the responsive list (Part 17 §17.0.2, Part 19 §19.2.5) ──────
// One column model, three renderings: cards below md, priority columns to lg,
// full columns above. The priority order IS the design — see columnModel.ts.
export {
  cardModel,
  cardSlotOf,
  columnWidths,
  COMPACT_PRIORITY_CUTOFF,
  describeHorizontalOverflow,
  dropOrder,
  fillTemplate,
  findHorizontalOverflow,
  GRID_ROW_HEIGHT,
  isHideable,
  LG_QUERY,
  loadColumnVisibility,
  MAX_CARD_META,
  MD_QUERY,
  UbDataGrid,
  UbDataGridEmptyState,
  UbDataGridMobileList,
  UbDataGridPagination,
  UbDataGridSkeletonRows,
  UbDataGridStateRow,
  UbDataGridStateTable,
  UbDataGridToolbar,
  useColumnVisibility,
  useGridTier,
  visibilityStorageKey,
  visibleColumns,
} from './UbDataGrid';
export type {
  HorizontalOverflowFinding,
  UbCardModel,
  UbCardSlot,
  UbColumnAlign,
  UbColumnPriority,
  UbColumnVisibility,
  UbColumnVisibilityApi,
  UbDataGridColumn,
  UbDataGridColumnMenuProps,
  UbDataGridEmptyCopy,
  UbDataGridEmptyStateProps,
  UbDataGridEmptyStates,
  UbDataGridLabels,
  UbDataGridMobileListProps,
  UbDataGridPaginationProps,
  UbDataGridProps,
  UbDataGridSkeletonRowsProps,
  UbDataGridStateRowProps,
  UbDataGridStateTableProps,
  UbDataGridTableProps,
  UbDataGridToolbarProps,
  UbGridPage,
  UbGridSort,
  UbGridState,
  UbGridTier,
} from './UbDataGrid';

// ── Charts and stat tiles ───────────────────────────────────────────────────
// A single current value is a tile, not a one-bar chart. Three forms earn a
// chart; pies, donuts, gauges and dual axes are banned product-wide.
export { UbAgingBars } from './charts/UbAgingBars';
export type { UbAgingBarsProps } from './charts/UbAgingBars';
export { UbChartCard } from './charts/UbChartCard';
export type { UbChartCardProps, UbChartCardTable } from './charts/UbChartCard';
export { UbChartGrid } from './charts/UbChartGrid';
export type { UbChartGridProps } from './charts/UbChartGrid';
export { UbChartTable } from './charts/UbChartTable';
export type { UbChartTableProps } from './charts/UbChartTable';
export { UbChartTooltip } from './charts/UbChartTooltip';
export type { UbChartTooltipProps } from './charts/UbChartTooltip';
export { UB_RANKED_BARS_CAP, UbRankedBars } from './charts/UbRankedBars';
export type { UbRankedBarsProps } from './charts/UbRankedBars';
export { UbStatCard } from './charts/UbStatCard';
export type {
  UbStatCardDelta,
  UbStatCardDeltaDirection,
  UbStatCardProps,
  UbStatCardTone,
} from './charts/UbStatCard';
export { UbStatGrid } from './charts/UbStatGrid';
export type { UbStatGridProps } from './charts/UbStatGrid';
export { UbTrendArea } from './charts/UbTrendArea';
export type { UbTrendAreaProps } from './charts/UbTrendArea';
export {
  CHART_AGING_RAMP,
  CHART_EMPHASIS_FILL,
  CHART_EMPHASIS_KEY,
  CHART_RECESSIVE_FILL,
  CHART_RECESSIVE_KEY,
  CHART_RESERVED_SERIES_TOKENS,
} from './charts/chartPalette';
export type { ChartRampStep } from './charts/chartPalette';
export type {
  UbAgingBucket,
  UbChartA11yIds,
  UbChartTableColumn,
  UbChartTableRow,
  UbRankedParty,
  UbTrendPoint,
} from './charts/chartTypes';
