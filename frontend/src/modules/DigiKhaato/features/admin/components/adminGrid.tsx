import { UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbDataGridColumn, UbDataGridLabels } from 'src/design-system';
import { formatBusinessDate } from 'src/utils/dates';

import { tenantStatusTone } from '../view-model/adminDisplay';

import type { AdminPartnerRow, AdminTenantRow } from '../types/admin.types';

type T = (id: string, values?: Record<string, string | number | Date>) => string;

/** The grid's own words, shared by the console's two lists. */
export const adminGridLabels = (t: T): UbDataGridLabels => ({
  loading: t('admin.loading'),
  pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
  previousPage: t('common.grid.previousPage'),
  nextPage: t('common.grid.nextPage'),
  pageSize: t('common.grid.pageSize'),
  goToPage: t('common.grid.goToPage', { page: '{page}' }),
  ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
  selectedCount: t('common.grid.selectedCount', { count: 0 }),
  selectAll: t('admin.grid.selectAll'),
  selectRow: t('admin.grid.selectRow', { name: '{name}' }),
  showing: t('common.grid.showing'),
  columns: t('common.grid.columns'),
  showAllColumns: t('common.grid.showAllColumns'),
  sortBy: t('common.grid.sortBy', { column: '{column}' }),
  sortedAscending: t('common.grid.sortedAscending'),
  sortedDescending: t('common.grid.sortedDescending'),
  openRow: t('admin.grid.open', { name: '{name}' }),
});

function Cell({ text, sub }: Readonly<{ text: string; sub?: string | null }>): React.JSX.Element {
  return (
    <UbStack gap={0.5} className="min-w-0">
      <UbText as="span" variant="body-sm" className="truncate">
        {text}
      </UbText>
      {sub ? (
        <UbText as="span" variant="caption" tone="tertiary" className="truncate">
          {sub}
        </UbText>
      ) : null}
    </UbStack>
  );
}

/** FR-2 — name, partner, plan, status, owner, usage, last activity. Dates dd/mm/yyyy. */
export const createTenantColumns = (t: T): readonly UbDataGridColumn<AdminTenantRow>[] => [
  {
    id: 'name',
    header: t('admin.tenants.column.name'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 24,
    cell: (row) => <Cell text={row.name} sub={row.gstin} />,
  },
  {
    id: 'status',
    header: t('admin.tenants.column.status'),
    priority: 1,
    cardSlot: 'trailing',
    widthShare: 12,
    cell: (row) => (
      <UbStatusBadge label={t(`admin.status.${row.status}`)} tone={tenantStatusTone(row.status)} />
    ),
  },
  {
    id: 'owner',
    header: t('admin.tenants.column.owner'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 20,
    cell: (row) => <Cell text={row.ownerEmail ?? '—'} />,
  },
  {
    id: 'plan',
    header: t('admin.tenants.column.plan'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 14,
    cell: (row) => <Cell text={row.plan.name} sub={row.partner.name} />,
  },
  {
    id: 'usage',
    header: t('admin.tenants.column.usage'),
    priority: 3,
    cardSlot: 'meta',
    widthShare: 14,
    cell: (row) => (
      <Cell text={t('admin.tenants.usage', { members: row.members, parties: row.parties })} />
    ),
  },
  {
    id: 'activity',
    header: t('admin.tenants.column.activity'),
    priority: 3,
    cardSlot: 'meta',
    widthShare: 12,
    cell: (row) => <Cell text={formatBusinessDate(row.lastActivityAt)} />,
  },
];

export const createPartnerColumns = (t: T): readonly UbDataGridColumn<AdminPartnerRow>[] => [
  {
    id: 'name',
    header: t('admin.partners.column.name'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 30,
    cell: (row) => <Cell text={row.name} sub={row.code} />,
  },
  {
    id: 'status',
    header: t('admin.partners.column.status'),
    priority: 1,
    cardSlot: 'trailing',
    widthShare: 14,
    cell: (row) => (
      <UbStatusBadge
        label={t(`admin.status.${row.status === 'active' ? 'active' : 'suspended'}`)}
        tone={row.status === 'active' ? 'success' : 'error'}
      />
    ),
  },
  {
    id: 'plan',
    header: t('admin.partners.column.plan'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 18,
    cell: (row) => <Cell text={row.defaultPlanCode ?? '—'} />,
  },
  {
    id: 'tenants',
    header: t('admin.partners.column.tenants'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 14,
    cell: (row) => <Cell text={String(row.tenantCount)} />,
  },
  {
    id: 'created',
    header: t('admin.partners.column.created'),
    priority: 3,
    cardSlot: 'meta',
    widthShare: 14,
    cell: (row) => <Cell text={formatBusinessDate(row.createdAt)} />,
  },
];
