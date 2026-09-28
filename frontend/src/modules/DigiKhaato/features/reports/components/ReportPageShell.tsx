'use client';

import type { ReactNode } from 'react';

import {
  UbDateInput,
  UbDateRangePicker,
  UbEmptyState,
  UbFilterBar,
  UbPageHeader,
  UbPageShell,
  UbStack,
  type UbDateRangePickerProps,
} from 'src/design-system';
import type { ApiErrorShape } from 'src/types/api.types';
import type { PermissionCode } from 'src/types/domain.types';

import { ListExportButton } from 'modules/DigiKhaato/features/imports/components/ListHeaderActions';

import { ReportStateBody, type ReportEmpty, type ReportState } from './ReportStateBody';

export type { ReportEmpty, ReportState } from './ReportStateBody';

/**
 * RPT-common's `ReportPageShell` — ONE layout for every report screen, so a
 * new report is its figures and nothing else. Track W4-A's day book is the
 * first caller; W4-B's registers and GST summary are the next.
 *
 * What it owns, top to bottom:
 *
 * 1. **The header** — `UbPageHeader`, one row: the title on the left, the
 *    actions on the right (a point-in-time report's "As of" date, the
 *    caller's `actions`, then Export). Every action passes
 *    `iconOnly="mobile"`, so on a phone they are 32 px squares on the title's
 *    line, wrapping below-left when they do not fit (owner, 23 Sep 2026).
 * 2. **The scope bar** — a range report's `period` renders
 *    `UbDateRangePicker` (presets on the scrolling track, the custom
 *    from/to on the right as "1 Apr 2026" controls), with the caller's
 *    `filters` as more chip groups on the track and `filterEnd` beside the
 *    dates. Without a period, `filters`/`filterEnd` get a plain `UbFilterBar`.
 * 3. **The body, by state** — `ReportStateBody`: `loading` draws a skeleton
 *    shaped like a report (tiles, then rows) and marks the region busy;
 *    `error` is `UbEmptyState` with the server's sentence, the request id and
 *    Retry; `empty` is the caller's empty state; `ready` renders `children`.
 *    A screen with no period and no export (the dashboard) uses
 *    `ReportStateBody` alone, so it does not ship the calendar.
 * 4. **Export (RPT-08)** — `exportAction.path` is the report's API path WITH
 *    the screen's filters; `ListExportButton` appends `format=csv`, saves a
 *    file of up to 5,000 rows and turns a 202 into "Preparing your file", so
 *    every report gets sync and async export for one prop. Hidden (never
 *    disabled) without the permission (§19.7.5).
 *
 * What it does NOT own: the report's figures, its table, or where its rows
 * drill through to. Rows link through `view-model/drillThrough.sourceHref`,
 * which the caller uses in its own columns.
 *
 * A reader without access gets `noAccess` alone — no header controls, no
 * export, no request that would 403.
 */

export interface ReportAsOf {
  readonly value: string;
  readonly max: string;
  readonly onChange: (value: string) => void;
  /** "As of" — the inline control's lead-in and accessible name. */
  readonly label: string;
  readonly placeholder: string;
  readonly name?: string;
}

export interface ReportExportAction {
  /** The report's API path with the screen's current filters (the file is the screen). */
  readonly path: string;
  /** Defaults to `reports.export`. */
  readonly permission?: PermissionCode;
  /** Nothing to export — disabled with the reason in its name. */
  readonly empty?: boolean;
}

export interface ReportPageShellProps<P extends string> {
  readonly title: string;
  readonly description?: string;
  /** Header actions beside Export; pass `iconOnly="mobile"` on each. */
  readonly actions?: ReactNode;
  /** A point-in-time report's date (aging, stock) — inline, on the header's right. */
  readonly asOf?: ReportAsOf;
  /** A range report's period — the presets and custom range, as the scope bar. */
  readonly period?: Omit<UbDateRangePickerProps<P>, 'children' | 'end' | 'className'>;
  /** More chip groups on the scope bar's track (`UbFilterChipGroup`s). */
  readonly filters?: ReactNode;
  /** More scope controls at the bar's right end — a switch, a select. */
  readonly filterEnd?: ReactNode;
  readonly exportAction?: ReportExportAction;
  /** A notice above the body — the historical-date banner, the hidden-columns hint. */
  readonly banner?: ReactNode;
  readonly state: ReportState;
  readonly error?: ApiErrorShape | null;
  readonly onRetry?: () => void;
  readonly empty?: ReportEmpty;
  /** Announced while loading ("Loading the day book"). */
  readonly loadingLabel: string;
  /** How many skeleton tiles above the skeleton rows; 0 for a list-only report. */
  readonly skeletonTiles?: number;
  /** The reader may not open this report: render this and nothing else. */
  readonly noAccess?: { readonly title: string; readonly description?: string } | null;
  readonly children?: ReactNode;
  readonly testId?: string;
}

export function ReportPageShell<P extends string>({
  title,
  description,
  actions,
  asOf,
  period,
  filters,
  filterEnd,
  exportAction,
  banner,
  state,
  error,
  onRetry,
  empty,
  loadingLabel,
  skeletonTiles = 4,
  noAccess,
  children,
  testId,
}: Readonly<ReportPageShellProps<P>>): React.JSX.Element {
  if (noAccess) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={noAccess.title}
          description={noAccess.description}
        />
      </UbPageShell>
    );
  }

  const headerActions =
    asOf || actions || exportAction ? (
      <>
        {asOf && (
          <UbDateInput
            name={asOf.name ?? 'report-as-of'}
            appearance="inline"
            inlineLabel={asOf.label}
            aria-label={asOf.label}
            placeholder={asOf.placeholder}
            value={asOf.value}
            max={asOf.max}
            onChange={(value: string | null) => asOf.onChange(value || asOf.max)}
          />
        )}
        {actions}
        {exportAction && (
          <ListExportButton
            listPath={exportAction.path}
            permission={exportAction.permission ?? 'reports.export'}
            empty={exportAction.empty}
          />
        )}
      </>
    ) : undefined;

  return (
    <UbPageShell>
      <UbPageHeader title={title} subtitle={description} actions={headerActions} />
      <UbStack gap={4} data-testid={testId}>
        {period ? (
          <UbDateRangePicker<P> {...period} end={filterEnd}>
            {filters}
          </UbDateRangePicker>
        ) : filters || filterEnd ? (
          <UbFilterBar end={filterEnd}>{filters}</UbFilterBar>
        ) : null}

        {banner}

        <ReportStateBody
          state={state}
          error={error}
          onRetry={onRetry}
          empty={empty}
          loadingLabel={loadingLabel}
          skeletonTiles={skeletonTiles}
        >
          {children}
        </ReportStateBody>
      </UbStack>
    </UbPageShell>
  );
}
