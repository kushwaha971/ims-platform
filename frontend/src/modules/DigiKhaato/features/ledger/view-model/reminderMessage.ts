import { formatPhoneForDisplay } from 'src/utils/share';

/**
 * LED-06 — the client's two small decisions about a reminder. The WORDS are the
 * server's now (NTF-03 BR-2: every message that carries money is composed where
 * the balance is read, `POST /reminders/preview`), so what is left here is
 * whether to offer the reminder at all, and who the sheet says it goes to.
 *
 * ── Only when the party owes the merchant ─────────────────────────────────
 * LED-06 FR-8: "the UI hides Remind when balance ≤ 0". A payable balance is
 * money the MERCHANT owes, and a message asking the supplier to pay it would be
 * the wrong way round. The server refuses it too (409 reminder_not_sendable).
 */
/** A reminder asks for money that is owed TO the merchant, and only then. */
/* "Is this decimal string above zero?" answered on the STRING: the balance is
   the server's canonical decimal, so it is positive exactly when it has no
   minus sign and a non-zero digit. `compareMoney` answers the same question
   through decimal.js-light, and importing it here put the arithmetic library
   on the khata route for a sign check. */
export const isRemindable = (balance: string | null | undefined): boolean => {
  const value = balance?.trim() ?? '';
  return value !== '' && !value.startsWith('-') && /[1-9]/.test(value);
};

/**
 * The sheet's second line: who it goes to. NTF-03 §8 — visible BEFORE the
 * action, so a wrong number is caught here rather than in WhatsApp. With no
 * mobile it says what will happen instead: WhatsApp will ask for the chat.
 */
export const reminderRecipient = (
  partyName: string,
  mobile: string | null | undefined
): { readonly id: string; readonly values: Readonly<Record<string, string>> } =>
  mobile
    ? /* Normalised for reading (QA O6) — the same normaliser the links use. */
      { id: 'ledger.remind.to', values: { name: partyName, mobile: formatPhoneForDisplay(mobile) } }
    : { id: 'ledger.remind.toNoMobile', values: { name: partyName } };
