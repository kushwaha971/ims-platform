import { createIntl } from 'react-intl';

import en from 'locales/en.json';
import hi from 'locales/hi.json';

import {
  REMINDER_MESSAGE_ID,
  isRemindable,
  reminderMessage,
  reminderRecipient,
} from './reminderMessage';

/**
 * LED-06's reminder text. The message is the one piece of this product a
 * CUSTOMER reads, in an app the merchant does not control, so each assertion
 * is a sentence that would otherwise reach somebody wrong.
 */
const resolve = (locale: 'en' | 'hi', id: string, values: Record<string, string>): string =>
  createIntl({
    locale,
    messages: (locale === 'en' ? en : hi) as Record<string, string>,
  }).formatMessage({ id }, values);

const INPUT = {
  partyName: 'Ramesh Traders',
  balance: '2500.00',
  shopName: 'Kumar Stores',
  asOf: '2026-09-23',
};

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

describe('reminderMessage', () => {
  it('carries the grouped figure without a symbol, and the date as dd/mm/yyyy', () => {
    /* Prevents: the recurring "₹₹2,800.00" / "₹2800.00" pairing of a copy
       string that carries its own currency with the wrong formatter — the
       copy says "Rs", so the figure must arrive grouped and bare. */
    expect(reminderMessage({ ...INPUT, balance: '123456.5' })).toEqual({
      id: REMINDER_MESSAGE_ID,
      values: {
        party: 'Ramesh Traders',
        shop: 'Kumar Stores',
        amount: '1,23,456.50',
        date: '23/09/2026',
      },
    });
  });

  it('refuses a payable or settled balance rather than inventing a variant', () => {
    /* Prevents: a reminder item on a supplier's khata that would ask THEM to
       pay what the merchant owes. */
    expect(reminderMessage({ ...INPUT, balance: '-2500.00' })).toBeNull();
    expect(reminderMessage({ ...INPUT, balance: '0.00' })).toBeNull();
  });

  it('refuses to write an unsigned demand for money', () => {
    /* Prevents: NTF-03 BR-11 — a message that ends "— " because the session
       had no business name, which a customer reads as spam. */
    expect(reminderMessage({ ...INPUT, shopName: '   ' })).toBeNull();
  });

  it('reads as the English reminder, in Rs, signed by the shop', () => {
    /* Prevents: the wording drifting from what was reviewed — in particular
       any "₹" (NTF-03 BR-8: the SMS channel would bill three segments) and
       any claim that something was already sent. */
    const message = reminderMessage(INPUT);
    expect(message).not.toBeNull();
    const text = resolve('en', message?.id ?? '', { ...message?.values });
    expect(text).toBe(
      'Namaste Ramesh Traders,\nRs 2,500.00 is pending with Kumar Stores as of 23/09/2026.\n' +
        'Kindly pay at your convenience. Thank you.\n— Kumar Stores'
    );
    expect(text).not.toContain('₹');
  });

  it('reads as the Hindi reminder with Latin numerals', () => {
    /* Prevents: §23.2.6 rule 6 broken in the one place it matters most —
       Devanagari digits (२,५००) in a figure the customer compares with a
       printed bill — and a Hindi message missing its sign-off. */
    const message = reminderMessage(INPUT);
    const text = resolve('hi', message?.id ?? '', { ...message?.values });
    expect(text).toBe(
      'नमस्ते Ramesh Traders,\n23/09/2026 तक Kumar Stores का Rs 2,500.00 बकाया है।\n' +
        'कृपया सुविधानुसार भुगतान करें। धन्यवाद।\n— Kumar Stores'
    );
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
