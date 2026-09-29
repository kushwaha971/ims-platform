import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import { formatTimestamp } from 'src/utils/dates';
import { roleLabel } from 'src/utils/roleLabel';

import { actionLabel, actorLabel, diffLines, entityTypeLabel } from '../view-model/auditDisplay';

import { AuditActorCell, AuditDiffCell, AuditTextCell } from './AuditCells';

import type { AuditRow } from '../types/audit.types';

type T = (id: string, values?: Record<string, string | number | Date>) => string;

/**
 * PLT-08 FR-2 — When · Who · Action · Entity · Details. Timestamps print
 * `dd/mm/yyyy, hh:mm` (§8, and the owner's rule for dates in rows).
 */
export const createAuditColumns = (t: T): readonly UbDataGridColumn<AuditRow>[] => [
  {
    id: 'action',
    header: t('audit.column.action'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 22,
    cell: (row) => <AuditTextCell text={actionLabel(row.action, t)} />,
  },
  {
    id: 'when',
    header: t('audit.column.when'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 16,
    cell: (row) => <AuditTextCell text={formatTimestamp(row.createdAt)} />,
  },
  {
    id: 'who',
    header: t('audit.filter.actor'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 18,
    cell: (row) => (
      <AuditActorCell
        name={actorLabel(row, t)}
        role={row.actor?.role ? roleLabel(t, row.actor.role) : null}
        formerLabel={row.actor?.isFormerMember ? t('audit.actor.former') : null}
      />
    ),
  },
  {
    id: 'entity',
    header: t('audit.column.entity'),
    priority: 2,
    // QA D8 — on a phone the card's caption line carries When and Who only;
    // a third stacked cell crowded the date and the name together.
    cardSlot: 'none',
    widthShare: 18,
    cell: (row) => (
      <AuditTextCell
        text={row.entityLabel ?? entityTypeLabel(row.entityType, t)}
        sub={row.entityLabel ? entityTypeLabel(row.entityType, t) : null}
      />
    ),
  },
  {
    id: 'details',
    header: t('audit.column.details'),
    priority: 3,
    cardSlot: 'none',
    widthShare: 26,
    cell: (row) => {
      const { lines, more } = diffLines(row, t);
      return (
        <AuditDiffCell
          lines={lines}
          moreLabel={more ? t('audit.detail.more', { count: more }) : null}
        />
      );
    },
  },
];
