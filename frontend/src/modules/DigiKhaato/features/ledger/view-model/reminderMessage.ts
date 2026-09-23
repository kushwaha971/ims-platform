import { formatBusinessDate } from 'src/utils/dates';
import { formatAmount } from 'src/utils/money';
import { formatPhoneForDisplay } from 'src/utils/share';

/**
 * LED-06 — the words of a payment reminder, as a decision rather than a
 * sentence. Pure (Part 19 §19.1.1 layer 3): the caller resolves the message id
 * with `t()`, so the same function speaks English and Hindi and is tested
 * without React.
 *
 * ── Only when the party owes the merchant ─────────────────────────────────
 * LED-06 FR-8: "Reminders are blocked when the party balance ≤ 0 (nothing to
 * collect); the UI hides Remind when balance ≤ 0." A payable balance is money
 * the MERCHANT owes, and a message asking the supplier to pay it would be the
 * wrong way round; a settled party has nothing to ask for. So `null`, and the
 * menu item is not drawn — not a "payable" variant of the text.
 *
 * ── `Rs`, not `₹`, inside the message ─────────────────────────────────────
 * NTF-03 BR-8: every share text says `Rs` — the SMS channel sits in the same
 * sheet, and `₹` is outside GSM-7, so one rupee sign turns a 160-character SMS
 * into a 70-character UCS-2 one and bills the merchant for three segments.
 * The in-app UI keeps `₹`. The copy string carries `Rs` and `formatAmount`
 * supplies the grouped figure WITHOUT a symbol — the pairing CLAUDE.md records
 * going wrong three times as "₹₹2,800.00" and "₹2800.00".
 *
 * ── Two decimals ───────────────────────────────────────────────────────────
 * LED-06 BR-3 drops `.00`. Kept here: the figure in the message is the figure
 * on the khata header and on the statement, to the paisa, and a customer who
 * compares the two should not find a different spelling of the same number.
 *
 * ── The date is TODAY, in the business's timezone ─────────────────────────
 * "as of" the day the merchant sends it, which is the only date the balance is
 * true on. The khata header's baseline is the last ENTRY's date, which answers
 * a different question ("when did this last move?") and would read to a
 * customer as a stale demand.
 */
export const REMINDER_MESSAGE_ID = 'ledger.remind.message';

export interface ReminderMessageInput {
  readonly partyName: string;
  /** The party's balance; positive means they owe the merchant. */
  readonly balance: string;
  /** The business's name — the active tenant's. */
  readonly shopName: string;
  /** ISO `YYYY-MM-DD`, in the tenant's timezone. */
  readonly asOf: string;
}

export interface ReminderMessage {
  readonly id: typeof REMINDER_MESSAGE_ID;
  readonly values: {
    readonly party: string;
    readonly shop: string;
    readonly amount: string;
    readonly date: string;
  };
}

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

export const reminderMessage = (input: ReminderMessageInput): ReminderMessage | null => {
  const shop = input.shopName.trim();
  // Without a sign-off the message is anonymous (NTF-03 BR-11 — it always
  // ends with the shop's name), and an anonymous demand for money is spam.
  if (!isRemindable(input.balance) || shop === '') return null;
  return {
    id: REMINDER_MESSAGE_ID,
    values: {
      party: input.partyName.trim(),
      shop,
      amount: formatAmount(input.balance),
      date: formatBusinessDate(input.asOf),
    },
  };
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
