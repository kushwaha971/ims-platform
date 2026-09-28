import en from 'locales/en.json';
import hi from 'locales/hi.json';

/**
 * QA O5 (Sprint 3): the Hindi share sheet read "व्हाट्सएप" and "एसएमएस". Indian
 * apps keep a brand or a channel in Latin script inside Hindi copy — it is how
 * the app is labelled on the merchant's own home screen and what they search
 * for — so a transliteration makes the button harder to recognise, not easier.
 */
const TRANSLITERATIONS = [/व्हाट्स\S*/u, /वॉट्स\S*/u, /एसएमएस/u];

describe('brand and channel names stay in Latin script in hi.json (O5)', () => {
  it('labels the two channels exactly as the apps are named', () => {
    expect(hi['share.whatsapp']).toBe('WhatsApp');
    expect(hi['share.sms']).toBe('SMS');
    expect(en['share.whatsapp']).toBe('WhatsApp');
  });

  it('transliterates neither anywhere in the Hindi copy', () => {
    const offending = Object.entries(hi as Record<string, string>).filter(([, value]) =>
      TRANSLITERATIONS.some((pattern) => pattern.test(value))
    );
    expect(offending).toEqual([]);
  });
});
