'use client';

import { memo, useEffect } from 'react';

import { BellRing } from 'lucide-react';

import { UbStack, UbText } from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useNowMs } from 'src/hooks/useNowMs';
import { useTranslation } from 'src/hooks/useTranslation';
import { relativeTimeView } from 'src/utils/relativeTime';

import { selectPartyReminderId, selectPartyReminderTotals } from '../redux/reminderSlice';
import { fetchPartyReminders } from '../redux/reminderThunk';
import { channelLabelId } from '../view-model/reminderDisplay';

/**
 * LED-06 FR-6 — the khata's one line of reminder history: "Reminded 3 times ·
 * last 2 days ago (WhatsApp)", or "Not reminded yet".
 *
 * One line and not a list, because the question at the counter is "did I
 * already ask?" — the full history is the reminders screen's Sent tab. The
 * count is the server's (`meta.totals.sent`), so it is every reminder this
 * party has had rather than the five rows the request carries.
 */
export interface PartyReminderStripProps {
  readonly partyId: string;
}

function PartyReminderStripBase({ partyId }: Readonly<PartyReminderStripProps>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const nowMs = useNowMs();
  const heldFor = useAppSelector(selectPartyReminderId);
  const totals = useAppSelector(selectPartyReminderTotals);

  useEffect(() => {
    const request = dispatch(fetchPartyReminders(partyId));
    return () => request.abort();
  }, [partyId, dispatch]);

  /* Nothing until this party's answer is in: a line that flashes "Not
     reminded yet" and then "Reminded 4 times" teaches the merchant to distrust
     it. */
  if (heldFor !== partyId || !totals) return null;

  let line: string;
  if (totals.sent === 0 || !totals.lastSentAt) {
    line = t('reminders.strip.never');
  } else {
    const when = relativeTimeView(totals.lastSentAt, nowMs);
    line = t('reminders.strip.summary', {
      count: totals.sent,
      when: t(when.id, when.values),
      channel: totals.lastChannel ? t(channelLabelId(totals.lastChannel)) : '',
    });
  }

  return (
    <UbStack direction="row" gap={2} align="center" data-testid="party-reminder-strip">
      <BellRing aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
      <UbText variant="body-sm" tone="secondary">
        {line}
      </UbText>
    </UbStack>
  );
}

export const PartyReminderStrip = memo(PartyReminderStripBase);
