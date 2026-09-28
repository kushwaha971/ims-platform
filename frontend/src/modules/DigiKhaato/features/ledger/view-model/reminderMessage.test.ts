import { createIntl } from 'react-intl';

import { en, hi } from 'src/tests/allMessages';

import { isRemindable, reminderRecipient } from './reminderMessage';

/**
 * LED-06's two client-side decisions: whether to offer a reminder at all, and
 * who the sheet says it goes to. The words themselves are the server's
 * (`apps/notifications/tests/test_messaging.py` holds them).
 */
const resolve = (
  locale: 'en' | 'hi',
  id: string,
  values: Readonly<Record<string, string>>
): string =>
  createIntl({
    locale,
    messages: (locale === 'en' ? en : hi) as Record<string, string>,
  }).formatMessage({ id }, values);

describe('isRemindable', () => {
  it('is true only when the party owes the merchant', () => {
    /* Prevents: LED-06 FR-8 — a "please pay" sent to a supplier the merchant
       owes (payable, negative), or to somebody who owes nothing. */
    expect(isRemindable('2500.00')).toBe(true);
    expect(isRemindable('0.01')).toBe(true);
    expect(isRemindable('0.00')).toBe(false);
    expect(isRemindable('-0.00')).toBe(false);
    expect(isRemindable('-2500.00')).toBe(false);
    expect(isRemindable('')).toBe(false);
    expect(isRemindable(null)).toBe(false);
  });
});

describe('reminderRecipient', () => {
  it('names the number when there is one, and says what happens when there is not', () => {
    /* Prevents: NTF-03 §8 — WhatsApp opening before the merchant could see
       which number it was going to, and a no-mobile party's sheet that gives
       no hint WhatsApp will ask for the chat. */
    const withMobile = reminderRecipient('Ramesh Traders', '+919812345678');
    expect(resolve('en', withMobile.id, withMobile.values)).toBe(
      'To Ramesh Traders · +91 98123 45678'
    );
    /* QA O6: shown normalised, whatever spelling was stored — the same
       normaliser the WhatsApp and SMS links dial through. */
    const legacy = reminderRecipient('Ramesh Traders', '09812345678');
    expect(resolve('en', legacy.id, legacy.values)).toBe('To Ramesh Traders · +91 98123 45678');
    const without = reminderRecipient('Ramesh Traders', null);
    expect(resolve('en', without.id, without.values)).toMatch(
      /^To Ramesh Traders · no mobile saved/
    );
  });
});
