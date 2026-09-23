import { UbBox, UbButton, UbLink, UbTag, UbText, isUbTagColor } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { partiesByTagPath } from 'src/routes';

import type { PartyTagWithCount } from '../types/party.types';

/**
 * PTY-05 FR-7 — the manager's three columns, built by a MODULE-LEVEL factory
 * and memoised by the screen (§19.9.4).
 *
 * ── The count is a link, and that is the column's whole point ───────────────
 * "Camp Area · 34" as plain text is a statistic. As a link to the party list
 * filtered by that tag it is the fastest route from "which tag holds this part
 * of the book" to working through it — which is the thing tags were built for.
 * A merchant deciding whether to delete a tag also lands on exactly the thing
 * the confirmation is about to talk about.
 *
 * ── Zero is worded, not printed ─────────────────────────────────────────────
 * "0 parties" is a number a reader has to translate; "Not used yet" is the
 * fact, and it is the fact that matters on this screen — an unused tag is the
 * one to merge or delete when the 200 ceiling is in sight (FR-13).
 */
export interface PartyTagColumnDeps {
  readonly t: TranslateFn;
  readonly canWrite: boolean;
  readonly canDelete: boolean;
  readonly onEdit: (tag: PartyTagWithCount) => void;
  readonly onMerge: (tag: PartyTagWithCount) => void;
  readonly onDelete: (tag: PartyTagWithCount) => void;
}

export const TAG_SORT_FIELDS = {
  name: 'name',
  partyCount: 'party_count',
} as const;

export const createPartyTagColumns = ({
  t,
  canWrite,
  canDelete,
  onEdit,
  onMerge,
  onDelete,
}: PartyTagColumnDeps): readonly UbDataGridColumn<PartyTagWithCount>[] => [
  {
    id: 'name',
    header: t('parties.tags.manage.column.name'),
    priority: 1,
    sortField: TAG_SORT_FIELDS.name,
    cardSlot: 'title',
    /* ── The widths are what stop "Rename" rendering as "e" ─────────────────
     *
     * They were 40/30/30, and at the md tier that gave the actions column about
     * 216 px for three text buttons that need roughly 260. The table does not
     * wrap and the cell truncates, so the first button was clipped to a single
     * letter — a control reading "e", on a management screen, in a build that
     * passed every test. It took a screenshot at 768 px to see it.
     *
     * The actions are the CONTENT of this screen, so they get the space and the
     * other two give it up: a tag name is a chip capped at 120 px and a party
     * count is two words. */
    widthShare: 34,
    /* The chip itself, not the name in body type. The merchant is looking at
       this screen to decide how the label READS on a party row, so showing it
       any other way here would be showing them something else. */
    cell: (tag) => <UbTag name={tag.name} color={isUbTagColor(tag.color) ? tag.color : null} />,
  },
  {
    id: 'partyCount',
    header: t('parties.tags.manage.column.parties'),
    priority: 1,
    sortField: TAG_SORT_FIELDS.partyCount,
    /* `trailing` on a phone card, which is the slot for a figure on the right —
       the same place the party list puts a balance. It was `meta`, under the
       name, which left the card's right-hand slot to the three action buttons
       and squeezed them until "Delete" rendered as "Delet". */
    cardSlot: 'trailing',
    widthShare: 22,
    cell: (tag) =>
      tag.partyCount === 0 ? (
        <UbText as="span" variant="inherit" tone="tertiary">
          {t('parties.tags.manage.countNone')}
        </UbText>
      ) : (
        <UbLink
          href={partiesByTagPath(tag.name)}
          variant="body-sm"
          /* Named for a screen reader, because "34" repeated down a column is
             thirty-four links called nothing. */
          aria-label={t('parties.tags.manage.viewParties', {
            count: tag.partyCount,
            name: tag.name,
          })}
        >
          {tag.partyCount === 1
            ? t('parties.tags.manage.countOne')
            : t('parties.tags.manage.count', { count: tag.partyCount })}
        </UbLink>
      ),
  },
  {
    id: 'actions',
    header: t('parties.tags.manage.column.actions'),
    priority: 1,
    align: 'end',
    /* Kept on the card, because this is a management screen — the actions ARE
       the content, and a phone rendering that dropped them would be a read-only
       copy of the screen whose job is to change things.
 
       `meta` rather than `trailing`: the card's trailing slot is a narrow strip
       beside the title and three text buttons in it came out as "Rename",
       "Merge into…" and "Delet". `meta` is a full-width line under the name,
       where they wrap if they must and stay readable if they do. */
    cardSlot: 'meta',
    widthShare: 44,
    cell: (tag) => (
      /* `flex-wrap`, so that a width the numbers above did not anticipate — a
         longer translation, a narrower sidebar, a browser at 90% zoom — costs a
         second line rather than a clipped word. `whitespace-nowrap` on each
         button because the enclosing cell truncates, and a button is a label
         rather than prose: half of "Merge into…" says nothing. */
      /* `justify-end` on the table, where the column is aligned right;
         `max-md:justify-start` on the card, where this is a full-width line
         under the name and a right-aligned row of buttons would float away from
         the thing it acts on. */
      <UbBox className="flex flex-wrap items-center justify-end gap-1 whitespace-normal max-md:justify-start">
        {/* Spelled out rather than hidden behind an overflow menu. There are
            three of them, they fit at the width this screen is read at, and a
            `⋯` on a management screen is a menu a merchant has to open in order
            to find out what the screen can do. */}
        {canWrite && (
          <>
            <UbButton
              variant="ghost"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => onEdit(tag)}
            >
              {t('parties.tags.rename.action')}
            </UbButton>
            <UbButton
              variant="ghost"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => onMerge(tag)}
            >
              {t('parties.tags.merge.action')}
            </UbButton>
          </>
        )}
        {canDelete && (
          <UbButton
            variant="destructive"
            size="sm"
            className="whitespace-nowrap"
            onClick={() => onDelete(tag)}
          >
            {t('parties.tags.delete.action')}
          </UbButton>
        )}
      </UbBox>
    ),
  },
];
