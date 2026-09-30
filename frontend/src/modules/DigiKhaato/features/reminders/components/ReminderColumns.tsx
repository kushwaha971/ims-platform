import { MessageCircle } from 'lucide-react';

import { UbButton, UbLink, UbStatusBadge, UbText } from 'src/design-system';
import type { UbDataGridColumn, UbGridTier } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { partyPath } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import {
  STATUS_TONE,
  channelLabelId,
  collectionCaption,
  kindLabelId,
  noteView,
  statusLabelId,
} from '../view-model/reminderDisplay';

import type { DueParty, Reminder } from '../types/reminder.types';

/**
 * Two column models for the reminders screen, built at module level and
 * memoised by the caller (§19.9.4): a bucket's parties, and the history.
 *
 * The priority list is the design (UbDataGrid): on a phone a bucket row is the
 * name, the balance and the promise caption — the three facts a merchant
 * decides "ring now or later" on — with Remind as its own control.
 */

export interface DueColumnDeps {
  readonly t: TranslateFn;
  readonly today: string;
  readonly tier: UbGridTier;
  readonly canRemind: boolean;
  readonly onRemind: (party: DueParty) => void;
}

export const createDueColumns = ({
  t,
  today,
  tier,
  canRemind,
  onRemind,
}: DueColumnDeps): readonly UbDataGridColumn<DueParty>[] => [
  {
    id: 'party',
    header: t('reminders.column.party'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 34,
    cell: (row) =>
      tier === 'cards' ? (
        row.name
      ) : (
        <UbLink href={partyPath(row.id)} variant="body-sm-medium">
          {row.name}
        </UbLink>
      ),
  },
  {
    id: 'due',
    header: t('reminders.column.due'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 22,
    cell: (row) => {
      const caption = collectionCaption(row.collectionDate, today);
      if (!caption) return null;
      const date = row.collectionDate ? formatBusinessDate(row.collectionDate) : '';
      return (
        <UbText
          as="span"
          variant="body-sm"
          tone={caption.id === 'reminders.due.overdue' ? 'error' : 'secondary'}
        >
          {t(caption.id, caption.values)}
          {tier !== 'cards' && date ? ` · ${date}` : ''}
        </UbText>
      );
    },
  },
  {
    id: 'balance',
    header: t('reminders.column.balance'),
    priority: 1,
    align: 'end',
    cardSlot: 'trailing',
    widthShare: 18,
    cell: (row) => (
      <UbText as="span" variant="body-sm-medium" className="ds-num">
        {formatInr(row.balance)}
      </UbText>
    ),
  },
  {
    id: 'action',
    header: t('reminders.column.action'),
    headerHidden: true,
    priority: 2,
    align: 'end',
    cardSlot: 'meta',
    widthShare: 14,
    hideable: false,
    /* On a phone the whole card is the Remind control (the page passes
       `onRowOpen`), so a button here would be a button inside a button; the
       card keeps only the no-mobile caption. */
    cell: (row) =>
      canRemind && tier !== 'cards' ? (
        <UbButton
          variant="outlineNeutral"
          size="sm"
          icon={<MessageCircle aria-hidden className="h-4 w-4" />}
          onClick={() => onRemind(row)}
          aria-label={t('reminders.remindParty', { name: row.name })}
        >
          {t('reminders.remind')}
        </UbButton>
      ) : !row.mobile ? (
        <UbText as="span" variant="caption" tone="tertiary">
          {t('reminders.noMobile')}
        </UbText>
      ) : null,
  },
];

export const createHistoryColumns = ({
  t,
  tier,
}: {
  readonly t: TranslateFn;
  readonly tier: UbGridTier;
}): readonly UbDataGridColumn<Reminder>[] => [
  {
    id: 'party',
    header: t('reminders.column.party'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 26,
    cell: (row) =>
      tier === 'cards' ? (
        row.partyName
      ) : (
        <UbLink href={partyPath(row.partyId)} variant="body-sm-medium">
          {row.partyName}
        </UbLink>
      ),
  },
  {
    id: 'how',
    header: t('reminders.column.how'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 22,
    cell: (row) => {
      const note = noteView(row.note);
      const detail = note.id ? t(note.id) : note.text;
      return (
        <UbText as="span" variant="body-sm" tone="secondary">
          {row.kind === 'manual' ? t(channelLabelId(row.channel)) : t(kindLabelId(row.kind))}
          {detail && row.status !== 'sent' ? ` · ${detail}` : ''}
          {/* A7 §11 — what a module reminder was about, and who got it. */}
          {row.subjectLabel ? ` · ${row.subjectLabel}` : ''}
          {row.recipient
            ? ` · ${t('reminders.module.toRecipient', { name: row.recipient.name })}`
            : ''}
        </UbText>
      );
    },
  },
  {
    id: 'status',
    header: t('reminders.column.status'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 14,
    cell: (row) => (
      <UbStatusBadge label={t(statusLabelId(row.status))} tone={STATUS_TONE[row.status]} />
    ),
  },
  {
    id: 'when',
    header: t('reminders.column.when'),
    priority: 3,
    cardSlot: 'none',
    widthShare: 16,
    cell: (row) => (
      <UbText as="span" variant="body-sm" tone="secondary">
        {formatBusinessDate(row.sentAt ?? row.createdAt)}
      </UbText>
    ),
  },
  {
    id: 'amount',
    header: t('reminders.column.amount'),
    priority: 1,
    align: 'end',
    cardSlot: 'trailing',
    widthShare: 16,
    cell: (row) => (
      <UbText as="span" variant="body-sm" className="ds-num">
        {row.snapshotBalance ? formatInr(row.snapshotBalance) : '—'}
      </UbText>
    ),
  },
];
