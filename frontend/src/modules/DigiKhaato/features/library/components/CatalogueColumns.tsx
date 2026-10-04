import { UbListItemText, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { copyPlace, shelfLine } from '../view-model/copyDisplay';

import { CopyStatusBadge } from './CopyStatusBadge';

import type { CopyRow, TitleRow } from '../types/catalogue.types';

/**
 * F03 (LIB-02 §8) — the titles grid: Title · Category · Copies. Scored against
 * one question, "is there a copy I can hand over?"
 *
 * | Column   | Priority | Card     | Why |
 * |---|---|---|---|
 * | Title    | 1 | title    | Owns its line and wraps (`line-clamp-2`); authors underneath. |
 * | Copies   | 1 | trailing | "2 of 3 on shelf" — the answer to the question. |
 * | Category | 2 | meta     | How a library browses. |
 *
 * There is no Holds column: holds have no table until LIB-08, and a column of
 * dashes is a claim about holds nobody has counted.
 */
export const createTitleColumns = ({
  t,
}: {
  readonly t: TranslateFn;
}): readonly UbDataGridColumn<TitleRow>[] => [
  {
    id: 'title',
    header: t('library.column.title'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 50,
    cell: (row) => (
      <UbListItemText
        primary={
          <UbText as="span" variant="body-sm" className="line-clamp-2 font-medium">
            {row.title}
          </UbText>
        }
        secondary={row.authors || undefined}
        secondaryVariant="caption"
        secondaryTone="tertiary"
      />
    ),
  },
  {
    id: 'category',
    header: t('library.column.category'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 22,
    cell: (row) => row.category?.name ?? '',
  },
  {
    id: 'copies',
    header: t('library.column.copies'),
    priority: 1,
    cardSlot: 'trailing',
    align: 'end',
    widthShare: 28,
    cell: (row) => {
      const line = shelfLine(row);
      return (
        <UbStack gap={1} align="end">
          <UbText as="span" variant="body-sm">
            {t(line.id, line.params)}
          </UbText>
          {row.status === 'archived' && (
            <UbStatusBadge tone="neutral" label={t('library.title.archived')} />
          )}
        </UbStack>
      );
    },
  },
];

/**
 * F03 (LIB-02 §8) — the copies grid: Number · Title · Place · Status. The
 * number is `ds-mono`, because it is what a librarian reads off a spine.
 */
export const createCopyColumns = ({
  t,
}: {
  readonly t: TranslateFn;
}): readonly UbDataGridColumn<CopyRow>[] => [
  {
    id: 'number',
    header: t('library.copy.accession'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 16,
    cell: (row) => (
      <UbText as="span" variant="body-sm" className="ds-mono">
        {t('library.copy.numberShort', { number: row.accessionNumber })}
      </UbText>
    ),
  },
  {
    id: 'title',
    header: t('library.column.title'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 44,
    cell: (row) => (
      <UbListItemText
        primary={
          <UbText as="span" variant="body-sm" className="line-clamp-2 font-medium">
            {row.title.title}
          </UbText>
        }
        secondary={row.volumeLabel || row.title.authors || undefined}
        secondaryVariant="caption"
        secondaryTone="tertiary"
      />
    ),
  },
  {
    id: 'place',
    header: t('library.column.place'),
    priority: 2,
    cardSlot: 'none',
    widthShare: 16,
    cell: (row) => copyPlace(row),
  },
  {
    id: 'status',
    header: t('library.column.status'),
    priority: 1,
    cardSlot: 'trailing',
    widthShare: 24,
    cell: (row) => <CopyStatusBadge status={row.status} t={t} />,
  },
];
