'use client';

import { useCallback, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { MoreHorizontal } from 'lucide-react';

import {
  UbAmount,
  UbBox,
  UbButton,
  UbCard,
  UbDivider,
  UbEmptyState,
  UbSkeleton,
  UbStack,
  UbStatusBadge,
  UbSwitch,
  UbText,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';
import { selectSessionUser } from 'src/redux/slice/sessionSlice';

import { useEntryCorrection } from '../hooks/useEntryCorrection';
import { usePartyLedger } from '../hooks/usePartyLedger';
import {
  amountLabelRepeatsTitle,
  entryAmountView,
  entryCaption,
  entryReason,
  entryTitle,
  isBackdated,
  isCorrectable,
  isOpeningEntry,
  isReversalRow,
} from '../view-model/entryDisplay';

import { EntryActionsMenu } from './EntryActionsMenu';

import type { LedgerEntry } from '../types/ledger.types';

/**
 * LED-03's two write surfaces, lazily — and this is measured, not defensive.
 *
 * Imported statically they put React Hook Form's resolver, the ledger Yup
 * schema and six controls into the route chunk of `/parties/[id]`, which is
 * **the** read screen of this product: the bundle gate refused the build at
 * +58.6 KB, paid by every merchant who ever opens a khata to look at a balance.
 * It is the same finding the party form drawer and LED-01's entry drawer are
 * already `dynamic()` for, and the page's own comments record both.
 *
 * `EntryActionsMenu` is NOT lazy. It is a `UbDialog` with two buttons, it has
 * no form machinery behind it, and it is the thing the merchant taps FIRST —
 * a ⋯ that waits for a chunk before it can open is worse than the bytes.
 *
 * `ssr: false` because a drawer is never part of a server render: it opens on
 * an interaction, so it is closed in every server pass.
 */
const LedgerCorrectionDrawerLazy = dynamic(
  () => import('./LedgerCorrectionDrawer').then((m) => m.LedgerCorrectionDrawer),
  { ssr: false }
);
const ReverseEntryDialogLazy = dynamic(
  () => import('./ReverseEntryDialog').then((m) => m.ReverseEntryDialog),
  { ssr: false }
);

/**
 * LED-01 — the khata's transactions, newest first.
 *
 * ── Why this is not a `UbTimeline` in the design system ───────────────────
 * `PartyDetailHeader` makes the argument at length and it holds here: a design
 * system that grows a component per domain noun stops being a design system.
 * This knows what a ledger entry is, which way round a debit reads and when an
 * author is worth naming — none of which a generic timeline could know, and all
 * of which a generic timeline would end up carrying as props nobody else sets.
 * It is composed from `UbStack`, `UbCard`, `UbAmount`, `UbText` and
 * `UbDivider`, which is what a design system is for.
 *
 * ── Why the rows are grouped by DATE and not by hour ──────────────────────
 * BR-5. A khata is read by day: "what happened on Tuesday" is a question a
 * shopkeeper asks and "what happened at 4 p.m." is not. The group header is the
 * business date, so a backdated entry appears under the day it happened rather
 * than the day it was typed — which is why it also carries a "Backdated" tag,
 * so a merchant who just saved one and cannot find it at the top knows where to
 * look.
 */
export function PartyLedgerTimeline({
  partyId,
}: Readonly<{ partyId: string }>): React.JSX.Element | null {
  const { t, d } = useTranslation();
  const ledger = usePartyLedger(partyId);
  const correction = useEntryCorrection();
  const user = useAppSelector(selectSessionUser);
  const viewerId = user?.id ?? null;

  /* Which row's ⋯ is open. Local state, not the store, and the difference from
     `correcting`/`reversing` is real: nothing outside this card can open a
     row's menu, whereas the khata header's buttons open the entry drawer and
     LED-03's dialogs have to survive the card re-rendering around them. */
  const [menuFor, setMenuFor] = useState<LedgerEntry | null>(null);
  const closeMenu = useCallback(() => setMenuFor(null), []);

  /* A module the tenant has not enabled does not exist: no card, no empty
     state, no explanation of a feature they have not bought. */
  if (!ledger.canRead) return null;

  return (
    <UbCard>
      <UbStack gap={3} className="p-4">
        <UbStack direction="row" justify="between" align="center" className="gap-3">
          <UbText variant="label" tone="tertiary">
            {t('ledger.timeline.title')}
          </UbText>
          {ledger.summary && ledger.summary.entryCount > 0 && (
            <UbText variant="caption" tone="tertiary">
              {t('ledger.timeline.count', { count: ledger.summary.entryCount })}
            </UbText>
          )}
        </UbStack>

        {/* LED-03 FR-7. Offered only to somebody who could make a correction,
            and only once the book has something in it — a switch that reveals
            history on an empty khata reveals nothing and asks a question the
            merchant has no way to answer.

            It is a switch rather than a chip because it is a MODE, not a
            filter: the two positions are two ways of reading the same book,
            and only one of them is on at a time. */}
        {correction.canCorrect && ledger.summary && ledger.summary.entryCount > 0 && (
          <UbSwitch
            checked={ledger.showCorrections}
            onCheckedChange={ledger.toggleCorrections}
            label={t('ledger.correction.showCorrections')}
          />
        )}

        {/* The two running totals. Only when there is something to total: a
            khata with no entries showing "You gave in all ₹0.00" is two lines
            of nothing above an empty state that already says it. */}
        {ledger.summary && ledger.summary.entryCount > 0 && (
          <UbStack direction="row" className="gap-6">
            <UbAmount
              value={ledger.summary.totalDebit}
              tone="receivable"
              sign="none"
              label={t('ledger.timeline.gave')}
              size="sm"
            />
            <UbAmount
              value={ledger.summary.totalCredit}
              tone="payable"
              sign="none"
              label={t('ledger.timeline.got')}
              size="sm"
            />
          </UbStack>
        )}

        {ledger.isLoading && <UbSkeleton variant="list" count={3} label={t('common.loading')} />}

        {ledger.status === 'failed' && (
          <UbEmptyState
            variant="error"
            title={t('ledger.timeline.error.title')}
            description={t('ledger.timeline.error.body')}
            requestId={ledger.error?.requestId}
            action={
              <UbButton variant="secondary" onClick={ledger.refetch}>
                {t('common.action.retry')}
              </UbButton>
            }
          />
        )}

        {ledger.isEmpty && (
          <UbEmptyState
            variant="firstUse"
            title={t('ledger.timeline.empty.title')}
            description={t('ledger.timeline.empty.body')}
          />
        )}

        {ledger.groups.map((group) => (
          <UbStack key={group.date} gap={2}>
            <UbText variant="caption" tone="tertiary">
              {d(group.date)}
            </UbText>
            <UbStack gap={0}>
              {group.entries.map((entry, index) => (
                <UbBox key={entry.id}>
                  {index > 0 && <UbDivider />}
                  <EntryRow
                    entry={entry}
                    t={t}
                    viewerId={viewerId}
                    wasCorrected={ledger.superseded.has(entry.id)}
                    onOpenMenu={
                      correction.canCorrect && isCorrectable(entry) ? setMenuFor : undefined
                    }
                  />
                </UbBox>
              ))}
            </UbStack>
          </UbStack>
        ))}

        {ledger.hasMore && (
          <UbButton
            variant="ghost"
            onClick={ledger.loadMore}
            busy={ledger.isLoadingMore}
            busyLabel={t('ledger.timeline.loadingMore')}
            fullWidth
          >
            {t('ledger.timeline.loadMore')}
          </UbButton>
        )}
      </UbStack>

      {/* All three mounted ONCE, outside the list. See `EntryActionsMenu`. */}
      <EntryActionsMenu
        entry={menuFor}
        t={t}
        onClose={closeMenu}
        onCorrect={correction.openCorrect}
        onReverse={correction.openReverse}
      />
      {/* Mounted only once there is something to show, so the chunk is
          requested on the tap rather than on every khata that renders. Both
          components already return `null` for a closed state; the guard here is
          about the IMPORT, not the render. */}
      {correction.reversing && <ReverseEntryDialogLazy correction={correction} />}
      {correction.correcting && <LedgerCorrectionDrawerLazy correction={correction} />}
    </UbCard>
  );
}

/**
 * One line of the khata.
 *
 * `t` arrives as a prop rather than from the hook, as every presentational
 * child in this codebase does: a list of fifty rows each calling `useTranslation`
 * subscribes fifty components to the locale.
 */
function EntryRow({
  entry,
  t,
  viewerId,
  wasCorrected,
  onOpenMenu,
}: Readonly<{
  entry: LedgerEntry;
  t: TranslateFn;
  viewerId: string | null;
  /** True when another loaded row supersedes this one — see the badge below. */
  wasCorrected: boolean;
  /** Absent when this row offers no actions, which removes the ⋯ entirely. */
  onOpenMenu?: (entry: LedgerEntry) => void;
}>): React.JSX.Element {
  const view = useMemo(
    () => entryAmountView(entry.direction, entry.entryType),
    [entry.direction, entry.entryType]
  );
  const caption = useMemo(() => entryCaption(entry, t, viewerId), [entry, t, viewerId]);
  const reason = entryReason(entry);
  const reversed = entry.status === 'reversed';
  const isOpening = isOpeningEntry(entry);

  return (
    <UbStack direction="row" justify="between" align="start" className="gap-3 py-3">
      <UbStack gap={1} className="min-w-0 flex-1">
        {/* The title has the LINE TO ITSELF, and it wraps rather than truncates.
 
            Both changed when LED-03 put a ⋯ in the trailing slot, and the sweep
            is what found it: on a 360 px phone "Opening balance" became
            "Opening bala…", and with corrections shown the note "Cement bags"
            was squeezed to a single apostrophe-wide sliver between two badges
            and an amount. That is the same defect PTY-05 recorded as "Rename"
            rendering as the letter **e**, one screen along and one feature
            later — and every unit test passed both times, because an accessible
            name is the full string whatever the pixels do.
 
            `line-clamp-2` rather than `truncate`: a note can be 255 characters
            and has to stop somewhere, but a short one — which is nearly all of
            them — now renders whole on two lines instead of being cut on one.
            A merchant can read a wrapped note; they cannot read "Opening bala…". */}
        <UbText
          variant="body"
          className={
            reversed
              ? 'line-clamp-2 break-words line-through opacity-60'
              : 'line-clamp-2 break-words'
          }
        >
          {entryTitle(entry, t)}
        </UbText>

        {/* Every badge lives on the CAPTION line, and wraps there.
 
            LED-02 moved the opening badge here one at a time and wrote down
            why; LED-03 makes it the rule, because the row can now carry three
            at once — "Corrected", "Backdated", and on a reversal row the word
            "Reversal" — and three pills beside a title leave no title.
 
            "Corrected" and "Reversed" are different events and the row says
            which. Both are struck through, but a merchant reading their own
            history at a dispute needs to know whether a replacement is standing
            somewhere in this khata or the money simply came back out. A row
            reversed by a future document void has no replacement and reads
            "Reversed", which is right for it. */}
        <UbStack direction="row" align="center" className="flex-wrap gap-2">
          {reversed && (
            <UbStatusBadge
              label={t(
                wasCorrected
                  ? 'ledger.correction.badge.corrected'
                  : 'ledger.correction.badge.reversed'
              )}
              tone="neutral"
            />
          )}
          {/* The reversal ROW itself, which is the other half of the pair and
              is only ever on screen with "Show corrections" on. Without this it
              would look like an ordinary "You got ₹500" in the middle of the
              timeline — an entry the merchant has no memory of making. */}
          {isReversalRow(entry) && (
            <UbStatusBadge label={t('ledger.entry.type.reversal')} tone="neutral" />
          )}
          {/* An opening is dated when the old book started and written down
              today, so it is backdated by definition — saying so on it would be
              a tag on every one of them, which is a tag that means nothing. */}
          {!isOpening && isBackdated(entry) && (
            <UbStatusBadge label={t('ledger.entry.backdated')} tone="neutral" />
          )}
          {/* LED-02 §7's badge: the one line in a khata that is not a
              transaction — nothing changed hands on that date, it is the
              position the book started from. */}
          {isOpening && <UbStatusBadge label={t('ledger.opening.badge')} tone="info" />}
          {caption && (
            <UbText variant="caption" tone="tertiary" className="min-w-0 truncate">
              {caption}
            </UbText>
          )}
        </UbStack>

        {/* The reason a line was changed, on a line of its own and wrapping.
 
            A caption is three terse tokens joined with "·" and truncated; a
            reason is prose. Folded into the caption, "Read the paper book
            wrong" rendered as "Read the paper …" on a phone — which is the
            same defect as the title it was written to explain. */}
        {reason && (
          <UbText variant="caption" tone="tertiary" className="line-clamp-2 break-words">
            {reason}
          </UbText>
        )}
      </UbStack>
      <UbStack direction="row" align="center" className="gap-1">
        <UbAmount
          value={entry.amount}
          tone={reversed ? 'neutral' : view.tone}
          sign="none"
          label={t(view.labelId)}
          /* Hidden when the title on the left is already those same two words —
           which it is on every entry without a note, so on most of them. The
           label stays in the accessible name either way; see the view-model. */
          labelHidden={amountLabelRepeatsTitle(entry)}
          size="sm"
        />
        {/* `iconOnly`, because the row is already at its width on a 360 px
            phone and a worded button would push the amount off the screen —
            which is the defect this feature's own sweep caught in the header.
            The label still NAMES THE ROW, so somebody navigating by control is
            not offered fifty buttons all called "More actions". */}
        {onOpenMenu && (
          <UbButton
            variant="ghost"
            size="sm"
            iconOnly
            icon={<MoreHorizontal className="h-4 w-4" aria-hidden />}
            onClick={() => onOpenMenu(entry)}
          >
            {t('ledger.correction.rowActions', { title: entryTitle(entry, t) })}
          </UbButton>
        )}
      </UbStack>
    </UbStack>
  );
}
