'use client';

import { useCallback, useMemo, useState } from 'react';

import type { UbShareChannel, UbShareSheetLabels } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useShareFeedback } from 'src/hooks/useShareFeedback';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectActiveTenant } from 'src/redux/slice/sessionSlice';
import { todayInTenantTz } from 'src/utils/dates';

import { isRemindable, reminderMessage, reminderRecipient } from '../view-model/reminderMessage';

/**
 * LED-06, the part that needs no table: a reminder the MERCHANT sends.
 *
 * ── What is deliberately not here ──────────────────────────────────────────
 * No `POST /reminders`, no `ledger_reminder` row, no history strip, no
 * "reminded 3 times". LED-06 FR-2 has the server log every nudge, and that
 * table does not exist; DEC-012 says the server sends nothing anyway. So this
 * composes the text on the device, opens WhatsApp or SMS with it, and says
 * only that the app was OPENED. The day the endpoint lands, `message` comes
 * from its `text` and the sheet does not change.
 *
 * ── Who sees it ────────────────────────────────────────────────────────────
 * `ledger.entry.read`, not LED-06 §12's `ledger.reminder.write`. That codename
 * gates CREATING A REMINDER ROW, and nothing here writes one: what the merchant
 * does is read a balance off the khata and send it to the customer from their
 * own phone, which anyone who can read the khata could already do by typing it.
 * Hiding the button from an accountant would hide nothing they cannot see.
 * The day `POST /reminders` exists, this becomes `ledger.reminder.write`,
 * because then it writes.
 *
 * It is also hidden on an archived party (FR-14 — archived is read-only, and
 * chasing somebody you have filed away is a mistake the product should not
 * offer), when the ledger module is off, and whenever the balance is not money
 * owed TO the merchant (FR-8).
 */
export interface PartyReminderSource {
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
  readonly title: string;
  readonly description: string;
  readonly message: string;
  readonly phone: string | null;
  readonly labels: UbShareSheetLabels;
  readonly onShared: (channel: UbShareChannel) => void;
  readonly onFailed: (channel: UbShareChannel) => void;
}

export const usePartyReminder = (party: PartyReminderSource | null): UsePartyReminderResult => {
  const { t } = useTranslation();
  const { can, hasModule } = usePermissions();
  const tenant = useAppSelector(selectActiveTenant);
  const feedback = useShareFeedback();
  const [open, setOpen] = useState(false);

  const name = party?.name ?? '';
  const balance = party?.balance ?? '';
  const mobile = party?.mobile ?? null;
  const shopName = tenant?.name ?? '';
  const timezone = tenant?.timezone;

  /* Computed when the sheet OPENS rather than on every render of the khata:
     "as of" is the day the merchant sends it, and a page left open overnight
     should not send yesterday's date. */
  const message = useMemo(() => {
    if (!open) return '';
    const composed = reminderMessage({
      partyName: name,
      balance,
      shopName,
      asOf: todayInTenantTz(timezone ?? undefined),
    });
    return composed ? t(composed.id, { ...composed.values }) : '';
  }, [open, name, balance, shopName, timezone, t]);

  const recipient = reminderRecipient(name, mobile);

  const canRemind =
    party !== null &&
    !party.isArchived &&
    hasModule('ledger') &&
    can('ledger.entry.read') &&
    isRemindable(balance) &&
    shopName.trim() !== '';

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
    title: t('ledger.remind.title'),
    description: t(recipient.id, { ...recipient.values }),
    message,
    phone: mobile,
    labels,
    onShared: feedback.onShared,
    onFailed: feedback.onFailed,
  };
};
