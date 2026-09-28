'use client';

import { useCallback, useMemo } from 'react';

import { useRouter } from 'next/navigation';

import {
  UbActionLink,
  UbButton,
  UbEmptyState,
  UbPageShell,
  UbSkeleton,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbStatusBanner,
  UbSwitch,
  UbTabs,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { absMoney, formatInr, isZeroAmount } from 'src/utils/money';

import { ListExportButton } from '../../imports/components/ListHeaderActions';
import { useGstSummary } from '../hooks/useGstSummary';
import { gstDrillHref } from '../view-model/gstDisplay';

import {
  b2csColumns,
  docsColumns,
  exceptionColumns,
  hsnColumns,
  natureColumns,
  rateColumns,
} from './GstColumns';
import { Gstr3bBoxes } from './Gstr3bBoxes';
import { GstSection, GstTable } from './GstSection';
import { TaxReportLayout } from './TaxReportLayout';

import type {
  GstB2csRow,
  GstDocsRow,
  GstException,
  GstHsnRow,
  GstNatureRow,
  GstRateRow,
  GstSummary,
  GstView,
} from '../types/taxReports.types';

const VIEWS: readonly GstView[] = ['gstr1', 'gstr3b', 'details'];

/**
 * RPT-07 — everything for GSTR-1 and GSTR-3B for one period, each figure
 * beside the return coordinate it is typed into.
 *
 * The four tiles answer the owner (Alternate A): what was sold, the tax on
 * it, the credit, and the one number to keep aside. The strip answers the
 * accountant's first question — can I file — and opens the list of what to
 * fix. Three views of ONE response (switching never refetches): GSTR-1 by
 * table, GSTR-3B by box, and the rate-wise detail a figure is defended from.
 * A rate row opens the sales register filtered to its code and supply
 * (FR-13 through CR-RPT-2's filters, instead of a drawer).
 */
export function GstReport(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const report = useGstSummary();
  const { data, query, view, setView } = report;

  const tabs = useMemo(
    () => VIEWS.map((value) => ({ value, label: t(`reports.gst.view.${value}`) })),
    [t]
  );
  const openRate = useCallback(
    (row: GstRateRow) => router.push(gstDrillHref(query, row)),
    [router, query]
  );
  const openException = useCallback(
    (row: GstException) =>
      router.push(
        row.documentKind === 'credit_note'
          ? `/sales/credit-notes/${encodeURIComponent(row.documentId)}`
          : `${ROUTES.SALES_INVOICES}/${encodeURIComponent(row.documentId)}`
      ),
    [router]
  );

  if (!report.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('reports.gst.noAccess.title')}
          description={t('reports.gst.noAccess.body')}
        />
      </UbPageShell>
    );
  }
  if (report.notRegistered) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('reports.gst.unregistered.title')}
          description={t('reports.gst.unregistered.body')}
          action={
            <UbActionLink href={ROUTES.SETTINGS_PROFILE} variant="secondary">
              {t('reports.gst.unregistered.action')}
            </UbActionLink>
          }
        />
      </UbPageShell>
    );
  }

  return (
    <TaxReportLayout
      title={t('reports.gst.title')}
      testId="gst-summary"
      preset={report.preset}
      dateFrom={query.dateFrom}
      dateTo={query.dateTo}
      today={report.today}
      onPresetChange={report.setPreset}
      onRangeChange={report.setRange}
      actions={
        <ListExportButton
          listPath={report.exportPath}
          permission="reports.export"
          empty={data !== null && data.meta.documentCount === 0}
        />
      }
      scope={
        <UbSwitch
          checked={query.rounding === 'rupee'}
          onCheckedChange={(checked) => report.setRounding(checked ? 'rupee' : 'paise')}
          label={t('reports.gst.rounding.label')}
        />
      }
    >
      {report.status === 'failed' && !data ? (
        <UbEmptyState
          variant="error"
          title={t('reports.gst.error.title')}
          description={report.error?.message ?? t('reports.gst.error.body')}
          requestId={report.error?.requestId ?? null}
          requestIdLabel={t('common.error.reference')}
          action={
            <UbButton variant="secondary" onClick={report.refetch}>
              {t('common.action.retry')}
            </UbButton>
          }
        />
      ) : !data ? (
        <UbStack gap={4} aria-busy="true" aria-label={t('reports.grid.loading')}>
          <UbSkeleton className="h-24 w-full" />
          <UbSkeleton className="h-48 w-full" />
          <UbSkeleton className="h-48 w-full" />
        </UbStack>
      ) : data.meta.documentCount === 0 && !data.inwardByRate?.rows.length ? (
        <UbEmptyState
          variant="firstUse"
          title={t('reports.gst.empty.title')}
          description={t('reports.gst.empty.body', {
            from: formatBusinessDate(data.meta.dateFrom),
            to: formatBusinessDate(data.meta.dateTo),
          })}
        />
      ) : (
        <GstBody
          data={data}
          view={view}
          setView={setView}
          tabs={tabs}
          rounding={query.rounding}
          openRate={openRate}
          openException={openException}
        />
      )}
    </TaxReportLayout>
  );
}

function GstBody({
  data,
  view,
  setView,
  tabs,
  rounding,
  openRate,
  openException,
}: Readonly<{
  data: GstSummary;
  view: GstView;
  setView: (view: GstView) => void;
  tabs: readonly { value: GstView; label: string }[];
  rounding: 'paise' | 'rupee';
  openRate: (row: GstRateRow) => void;
  openException: (row: GstException) => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  // §19.9.4 — column models are memoised, never rebuilt inline on every render.
  const columns = useMemo(
    () => ({
      nature: natureColumns(t),
      b2cs: b2csColumns(t),
      hsn: hsnColumns(t),
      docs: docsColumns(t),
      outward: rateColumns(t),
      inward: rateColumns(t, true),
      exceptions: exceptionColumns(t),
    }),
    [t]
  );
  const net = data.gstr3b?.net;
  const netNegative = !!net && net.total.startsWith('-');
  const issues = data.meta.exceptionCount;
  const rateId = (row: GstRateRow) =>
    `${row.taxCode}-${row.taxRate}-${row.isInterState}-${row.itcEligible}-${row.reverseCharge}`;
  const rateName = (row: GstRateRow) => `${row.taxCode} ${row.taxRate}`;

  return (
    <UbStack gap={4}>
      {data.composition ? (
        <UbStatusBanner
          tone="info"
          title={t('reports.gst.composition.title')}
          description={t('reports.gst.composition.body', {
            turnover: formatInr(data.composition.turnover),
            rate: Number(data.composition.rate),
            tax: formatInr(data.composition.tax),
          })}
        />
      ) : (
        <UbStatGrid label={t('reports.gst.tiles')}>
          <UbStatCard
            label={t('reports.gst.tile.taxable')}
            value={formatInr(data.outwardByRate?.total.taxableValue ?? null)}
            subtext={t('reports.gst.tile.documents', { count: data.meta.documentCount })}
          />
          <UbStatCard
            label={t('reports.gst.tile.output')}
            value={formatInr(net?.outputTax ?? null)}
          />
          <UbStatCard
            label={t('reports.gst.tile.itc')}
            value={formatInr(net?.itc ?? null)}
            tone="success"
          />
          <UbStatCard
            label={t(netNegative ? 'reports.gst.tile.carryForward' : 'reports.gst.tile.net')}
            value={formatInr(net ? absMoney(net.total) : null)}
            tone="warning"
            subtext={t('reports.gst.tile.due', { date: formatBusinessDate(data.meta.gstr3bDue) })}
          />
        </UbStatGrid>
      )}

      <UbStatusBanner
        tone={issues === 0 ? 'success' : 'warning'}
        title={
          issues === 0
            ? t('reports.gst.strip.ready')
            : t('reports.gst.strip.issues', { count: issues })
        }
        description={rounding === 'rupee' ? t('reports.gst.rounding.caption') : undefined}
        action={
          issues > 0 && view !== 'details' ? (
            <UbButton variant="secondary" size="sm" onClick={() => setView('details')}>
              {t('reports.gst.strip.review')}
            </UbButton>
          ) : undefined
        }
      />

      <UbTabs<GstView>
        value={view}
        onValueChange={setView}
        tabs={tabs}
        ariaLabel={t('reports.gst.view.label')}
        layout="fit"
      >
        <UbStack gap={4}>
          {view === 'gstr1' && (
            <>
              <GstSection
                title={t('reports.gst.section.nature')}
                coordinate="GSTR-1"
                hint={t('reports.gst.hint.nature')}
              >
                <GstTable<GstNatureRow>
                  rows={data.byNature}
                  columns={columns.nature}
                  rowId={(row) => row.nature}
                  rowName={(row) => row.nature}
                  caption={t('reports.gst.section.nature')}
                />
              </GstSection>
              <GstSection
                title={t('reports.gst.section.b2cs')}
                coordinate="GSTR-1 · 7"
                hint={t('reports.gst.hint.b2cs')}
              >
                <GstTable<GstB2csRow>
                  rows={data.b2cs}
                  columns={columns.b2cs}
                  rowId={(row) => `${row.posState}-${row.taxRate}-${row.isInterState}`}
                  rowName={(row) => row.posState}
                  caption={t('reports.gst.section.b2cs')}
                />
              </GstSection>
              <GstSection
                title={t('reports.gst.section.hsn')}
                coordinate="GSTR-1 · 12"
                hint={t('reports.gst.hint.hsn')}
              >
                <GstTable<GstHsnRow>
                  rows={data.hsn?.rows ?? []}
                  columns={columns.hsn}
                  rowId={(row) => `${row.hsnSac}-${row.uqc}-${row.taxRate}-${row.supplyType}`}
                  rowName={(row) => row.hsnSac}
                  caption={t('reports.gst.section.hsn')}
                />
              </GstSection>
              <GstSection
                title={t('reports.gst.section.docs')}
                coordinate="GSTR-1 · 13"
                hint={t('reports.gst.hint.docs')}
              >
                <GstTable<GstDocsRow>
                  rows={data.docs}
                  columns={columns.docs}
                  rowId={(row) => `${row.nature}-${row.seriesPrefix}`}
                  rowName={(row) => row.seriesPrefix}
                  caption={t('reports.gst.section.docs')}
                />
              </GstSection>
            </>
          )}
          {view === 'gstr3b' && data.gstr3b && <Gstr3bBoxes gstr3b={data.gstr3b} />}
          {view === 'details' && (
            <>
              <GstSection
                title={t('reports.gst.section.outward')}
                coordinate="GSTR-3B · 3.1"
                hint={t('reports.gst.hint.outward')}
              >
                <GstTable<GstRateRow>
                  rows={data.outwardByRate?.rows ?? []}
                  columns={columns.outward}
                  rowId={rateId}
                  rowName={rateName}
                  caption={t('reports.gst.section.outward')}
                  onRowOpen={openRate}
                />
              </GstSection>
              {data.inwardByRate && (
                <GstSection
                  title={t('reports.gst.section.inward')}
                  coordinate="GSTR-3B · 4(A)"
                  hint={
                    data.itc && !isZeroAmount(data.itc.notClaimable)
                      ? t('reports.gst.hint.notClaimable', {
                          amount: formatInr(data.itc.notClaimable),
                        })
                      : t('reports.gst.hint.inward')
                  }
                >
                  <GstTable<GstRateRow>
                    rows={data.inwardByRate.rows}
                    columns={columns.inward}
                    rowId={rateId}
                    rowName={rateName}
                    caption={t('reports.gst.section.inward')}
                  />
                </GstSection>
              )}
              <GstSection
                title={t('reports.gst.section.exceptions')}
                coordinate={t('reports.gst.exceptions.coordinate')}
                hint={t('reports.gst.hint.exceptions')}
              >
                <GstTable<GstException>
                  rows={data.exceptions}
                  columns={columns.exceptions}
                  rowId={(row) => `${row.documentId}-${row.issueCode}`}
                  rowName={(row) => row.number}
                  caption={t('reports.gst.section.exceptions')}
                  onRowOpen={openException}
                />
              </GstSection>
            </>
          )}
        </UbStack>
      </UbTabs>
    </UbStack>
  );
}
