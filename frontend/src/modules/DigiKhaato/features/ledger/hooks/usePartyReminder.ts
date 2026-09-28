'use client';

import { useCallback, useMemo, useState } from 'react';

import type { UbShareSheetLabels } from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';

import { isRemindable, reminderRecipient } from '../view-model/reminderMessage';

/**
 * LED-06 on the khata page: whether to offer "Send reminder", and the sheet's
 * open state and fixed words. The message itself is the SERVER's
 * (`POST /reminders/preview`, NTF-03 BR-2) and is fetched by
 * `PartyReminderSheet` when it opens, so a khata that is only read never asks.
 *
 * ── Who sees it ────────────────────────────────────────────────────────────
 * `ledger.reminder.write` (LED-06 §12). Sending now WRITES — the tap on
 * WhatsApp, SMS or Call records a `ledger_reminder` row, which is what feeds
 * the history strip and the Sent tab — so an accountant, who can read the
 * khata, no longer sees it. And `ledger.entry.read` as well: without it the
 * khata's entries are hidden, and the reminder would read them out anyway.
 *
 * It is also hidden on an archived party (FR-14), when the ledger module is
 * off, and whenever the balance is not money owed TO the merchant (FR-8).
 */
export interface PartyReminderSource {
  readonly id: string;
  readonly name: string;
  /** The balance the header shows — positive when they owe the merchant. */
  readonly balance: string;
  readonly mobile: string | null;
  readonly isArchived: boolean;
}

export interface UsePartyReminderResult {
  readonly canRemind: boolean;
  readonly open: boolean;
  readonly openSheet: () => void;
  readonly setOpen: (open: boolean) => void;
  readonly partyId: string;
  readonly title: string;
  readonly description: string;
  readonly phone: string | null;
  readonly labels: UbShareSheetLabels;
}

export const usePartyReminder = (party: PartyReminderSource | null): UsePartyReminderResult => {
  const { t } = useTranslation();
  const { can, hasModule } = usePermissions();
  const [open, setOpen] = useState(false);

  const name = party?.name ?? '';
  const mobile = party?.mobile ?? null;
  const recipient = reminderRecipient(name, mobile);

  const canRemind =
    party !== null &&
    !party.isArchived &&
    hasModule('ledger') &&
    /* Both, as the Reminders page already asks: the message states the
       balance and the entries behind it, so a member denied the khata's
       entries (QA: staff with a `ledger.entry.read` deny override) must not
       be handed the control that reads them out — whatever else they hold. */
    can('ledger.entry.read') &&
    can('ledger.reminder.write') &&
    isRemindable(party.balance);

  /* A sheet left open while the balance reaches zero (an entry saved on
     another device, the page refetching) closes, and STAYS closed: resetting
     the flag rather than masking it means a later balance does not pop the
     sheet back up on its own. State adjusted during render, React's pattern
     for state derived from props, rather than an effect a frame late. */
  if (open && !canRemind) setOpen(false);

  const openSheet = useCallback(() => setOpen(true), []);

  const labels = useMemo<UbShareSheetLabels>(
    () => ({
      whatsapp: t('share.whatsapp'),
      sms: t('share.sms'),
      call: t('reminders.sheet.call'),
      copy: t('share.copyText'),
      more: t('share.more'),
      close: t('common.action.close'),
      preview: t('share.preview'),
    }),
    [t]
  );

  return {
    canRemind,
    open,
    openSheet,
    setOpen,
    partyId: party?.id ?? '',
    title: t('ledger.remind.title'),
    description: t(recipient.id, { ...recipient.values }),
    phone: mobile,
    labels,
  };
};
