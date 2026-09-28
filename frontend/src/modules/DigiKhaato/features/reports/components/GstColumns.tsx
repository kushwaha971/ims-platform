import { UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';

import { ReportAmount } from './ReportAmount';

import type {
  GstB2csRow,
  GstDocsRow,
  GstException,
  GstHeads,
  GstHsnRow,
  GstNatureRow,
  GstRateRow,
} from '../types/taxReports.types';

/**
 * RPT-07's tables. Return vocabulary (GSTR-1, 3B, B2B, HSN, UQC, ITC) is the
 * portal's and is not translated (NFR); the words around it are. Every figure
 * is the server's string, painted by `ReportAmount`, never re-added.
 */

const amount = <T extends GstHeads>(
  id: keyof GstHeads,
  header: string,
  priority: 1 | 2 | 3 | 4,
  cardSlot: 'meta' | 'trailing' | 'none' = 'none'
): UbDataGridColumn<T> => ({
  id,
  header,
  priority,
  align: 'end',
  cardSlot,
  widthShare: 11,
  cell: (row) => <ReportAmount value={row[id]} />,
});

const heads = <T extends GstHeads>(t: TranslateFn): UbDataGridColumn<T>[] => [
  amount<T>('taxableValue', t('reports.gst.column.taxable'), 1, 'trailing'),
  amount<T>('cgst', 'CGST', 2),
  amount<T>('sgst', 'SGST', 2),
  amount<T>('igst', 'IGST', 2),
  amount<T>('cess', t('reports.gst.column.cess'), 3),
];

const rateLabel = (rate: string): string => `${Number(rate)}%`;

export const rateColumns = (t: TranslateFn, inward = false): UbDataGridColumn<GstRateRow>[] => [
  {
    id: 'rate',
    header: t('reports.gst.column.rate'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 18,
    cell: (row) =>
      [
        `${row.taxCode} · ${rateLabel(row.taxRate)}`,
        t(row.isInterState ? 'reports.gst.inter' : 'reports.gst.intra'),
        inward && row.reverseCharge ? 'RCM' : null,
        inward && row.itcEligible === false ? t('reports.gst.noItc') : null,
      ]
        .filter(Boolean)
        .join(' · '),
  },
  {
    id: 'count',
    header: t(inward ? 'reports.gst.column.bills' : 'reports.gst.column.documents'),
    priority: 2,
    cardSlot: 'meta',
    align: 'end',
    widthShare: 8,
    cell: (row) => String(row.count),
  },
  ...heads<GstRateRow>(t),
  {
    id: 'box',
    header: t('reports.gst.column.box'),
    priority: 3,
    cardSlot: 'none',
    widthShare: 9,
    cell: (row) => (row.box ? `GSTR-3B · ${row.box}` : '—'),
  },
];

export const natureColumns = (t: TranslateFn): UbDataGridColumn<GstNatureRow>[] => [
  {
    id: 'nature',
    header: t('reports.gst.column.nature'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 24,
    cell: (row) => (
      <UbStack gap={0.5} className="min-w-0">
        <UbText as="span" variant="body-sm">
          {t(`reports.gst.nature.${row.nature}`)}
        </UbText>
        <UbText as="span" variant="caption" tone="tertiary">
          {row.applicable ? `GSTR-1 · ${row.table}` : t('reports.gst.nature.notApplicable')}
        </UbText>
      </UbStack>
    ),
  },
  {
    id: 'documents',
    header: t('reports.gst.column.documents'),
    priority: 2,
    cardSlot: 'meta',
    align: 'end',
    widthShare: 8,
    cell: (row) => (row.applicable ? String(row.documentCount) : '—'),
  },
  ...heads<GstNatureRow>(t),
  {
    id: 'invoiceValue',
    header: t('reports.gst.column.invoiceValue'),
    priority: 3,
    cardSlot: 'none',
    align: 'end',
    widthShare: 11,
    cell: (row) => (row.invoiceValue === null ? '—' : <ReportAmount value={row.invoiceValue} />),
  },
];

export const b2csColumns = (t: TranslateFn): UbDataGridColumn<GstB2csRow>[] => [
  {
    id: 'state',
    header: t('reports.gst.column.placeOfSupply'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 18,
    cell: (row) =>
      `${row.posState} · ${rateLabel(row.taxRate)} · ${t(row.isInterState ? 'reports.gst.inter' : 'reports.gst.intra')}`,
  },
  ...heads<GstB2csRow>(t),
];

export const hsnColumns = (t: TranslateFn): UbDataGridColumn<GstHsnRow>[] => [
  {
    id: 'hsn',
    header: 'HSN/SAC',
    priority: 1,
    cardSlot: 'title',
    widthShare: 22,
    cell: (row) => (
      <UbStack gap={0.5} className="min-w-0">
        <UbText as="span" variant="body-sm" className="ds-num">
          {row.hsnSac === '(missing)' ? t('reports.gst.hsn.missing') : row.hsnSac}
        </UbText>
        <UbText as="span" variant="caption" tone="tertiary" className="line-clamp-2">
          {[row.description, row.supplyType.toUpperCase(), rateLabel(row.taxRate)].join(' · ')}
        </UbText>
      </UbStack>
    ),
  },
  {
    id: 'qty',
    header: t('reports.gst.column.qty'),
    priority: 1,
    cardSlot: 'meta',
    align: 'end',
    widthShare: 10,
    cell: (row) => `${row.totalQty} ${row.uqc}`,
  },
  ...heads<GstHsnRow>(t),
];

export const docsColumns = (t: TranslateFn): UbDataGridColumn<GstDocsRow>[] => [
  {
    id: 'nature',
    header: t('reports.gst.column.nature'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 22,
    cell: (row) => `${t(`reports.gst.docs.${row.nature}`)} · ${row.seriesPrefix}`,
  },
  {
    id: 'from',
    header: t('reports.gst.docs.from'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 16,
    cell: (row) => row.fromNumber,
  },
  {
    id: 'to',
    header: t('reports.gst.docs.to'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 16,
    cell: (row) => row.toNumber,
  },
  {
    id: 'total',
    header: t('reports.gst.docs.total'),
    priority: 1,
    cardSlot: 'trailing',
    align: 'end',
    widthShare: 8,
    cell: (row) => String(row.totalCount),
  },
  {
    id: 'cancelled',
    header: t('reports.gst.docs.cancelled'),
    priority: 2,
    cardSlot: 'none',
    align: 'end',
    widthShare: 9,
    cell: (row) => String(row.cancelledCount),
  },
  {
    id: 'net',
    header: t('reports.gst.docs.net'),
    priority: 2,
    cardSlot: 'none',
    align: 'end',
    widthShare: 9,
    cell: (row) => String(row.netIssued),
  },
];

export const exceptionColumns = (t: TranslateFn): UbDataGridColumn<GstException>[] => [
  {
    id: 'document',
    header: t('reports.gst.column.document'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 22,
    cell: (row) => `${row.number} · ${row.partyName || '—'}`,
  },
  {
    id: 'date',
    header: t('reports.gst.column.date'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 11,
    cell: (row) => formatBusinessDate(row.documentDate),
  },
  {
    id: 'issue',
    header: t('reports.gst.column.issue'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 40,
    cell: (row) => <UbStatusBadge tone="warning" label={t(`reports.gst.issue.${row.issueCode}`)} />,
  },
];
