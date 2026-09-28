import {
  buildSmsUrl,
  buildWhatsAppUrl,
  canUseNativeShare,
  encodeShareText,
  formatPhoneForDisplay,
  toDialableNumber,
  isShareAbort,
  toWhatsAppDigits,
} from './share';

/**
 * The links `UbShareSheet` opens. Every assertion here is a message that would
 * otherwise reach a customer mangled, or reach the wrong customer.
 */
describe('toWhatsAppDigits', () => {
  it.each([
    ['+919812345678', '919812345678'],
    ['+91 98123 45678', '919812345678'],
    ['+91-98123-45678', '919812345678'],
    ['919812345678', '919812345678'],
    ['9812345678', '919812345678'],
    ['98123 45678', '919812345678'],
    ['09812345678', '919812345678'],
    ['0091 98123 45678', '919812345678'],
    ['+91 098123 45678', '919812345678'],
    ['(+91) 98123.45678', '919812345678'],
  ])('reads %p as the Indian mobile %p', (raw, digits) => {
    /* Prevents: a stored or pasted number in any of the spellings a
       shopkeeper actually writes producing a `wa.me` link to a number that
       does not exist — WhatsApp then says "invalid phone number" at the
       counter, or worse, opens a chat with a stranger. */
    expect(toWhatsAppDigits(raw)).toBe(digits);
  });

  it('keeps a foreign E.164 number as it was written', () => {
    /* Prevents: a number that already carries a non-Indian country code being
       forced into +91, which would address somebody else entirely. */
    expect(toWhatsAppDigits('+44 20 7946 0958')).toBe('442079460958');
  });

  it.each([null, undefined, '', '   ', '12345', '98123456', '+1234', 'call me'])(
    'refuses to guess at %p',
    (raw) => {
      /* Prevents: a half-parsed number being used at all. A balance sent to a
         guessed number cannot be recalled; the number-less link lets the
         merchant choose the chat instead. */
      expect(toWhatsAppDigits(raw)).toBeNull();
    }
  );
});

describe('encodeShareText', () => {
  it('percent-encodes the rupee sign as UTF-8', () => {
    /* Prevents: ₹ reaching WhatsApp as mojibake ("â‚¹") because it was
       escaped as Latin-1 or left raw in a URL. */
    expect(encodeShareText('₹2,500.00')).toBe('%E2%82%B92%2C500.00');
  });

  it('keeps line breaks as line breaks and folds CRLF', () => {
    /* Prevents: a message losing its lines (raw "\n" in a URL is dropped by
       some handlers) or arriving with a stray %0D from a Windows paste. */
    expect(encodeShareText('Namaste\nRamesh')).toBe('Namaste%0ARamesh');
    expect(encodeShareText('a\r\nb\rc')).toBe('a%0Ab%0Ac');
  });

  it('round-trips Devanagari exactly', () => {
    /* Prevents: the Hindi reminder arriving garbled — each letter is three
       UTF-8 bytes and every one of them has to survive. */
    const hindi = 'नमस्ते रमेश ट्रेडर्स,\nशर्मा स्टोर का Rs 2,500.00 बकाया है।';
    expect(decodeURIComponent(encodeShareText(hindi))).toBe(hindi);
    expect(encodeShareText('न')).toBe('%E0%A4%A8');
  });

  it('encodes the characters that would cut the text parameter short', () => {
    /* Prevents: "Ramesh & Sons" becoming a message that ends at "Ramesh "
       because `&` started a new parameter, or a `+` read back as a space. */
    expect(encodeShareText('A & B #1 ?x=y +2')).toBe('A%20%26%20B%20%231%20%3Fx%3Dy%20%2B2');
  });
});

describe('buildWhatsAppUrl', () => {
  it('addresses the party when the number is readable', () => {
    /* Prevents: the wrong URL shape — `wa.me/+91…` or `wa.me/91 98…` both
       open WhatsApp's "invalid number" page. */
    expect(buildWhatsAppUrl('Hi', '+91 98123 45678')).toBe('https://wa.me/919812345678?text=Hi');
  });

  it('falls back to letting the merchant choose the chat', () => {
    /* Prevents: a party with no mobile having no way to be reminded at all,
       or a link to `wa.me/null`. */
    expect(buildWhatsAppUrl('Hi', null)).toBe('https://wa.me/?text=Hi');
    expect(buildWhatsAppUrl('Hi', 'not a number')).toBe('https://wa.me/?text=Hi');
  });

  it('carries the whole message, decodable back to what the merchant previewed', () => {
    /* Prevents: the text a merchant read in the sheet differing from what
       lands in WhatsApp's compose box. */
    const text = 'Namaste Ramesh,\nRs 2,500.00 is pending with Kumar & Co.';
    const url = new URL(buildWhatsAppUrl(text, '9812345678'));
    expect(url.searchParams.get('text')).toBe(text);
  });
});

describe('buildSmsUrl', () => {
  it('uses the ?&body= form with a + number', () => {
    /* Prevents: the body being dropped on one platform — iOS and Android
       disagree about `?body=` versus `&body=`, and only `?&body=` suits both. */
    expect(buildSmsUrl('Hi there', '09812345678')).toBe('sms:+919812345678?&body=Hi%20there');
  });

  it('opens a blank recipient when there is no number', () => {
    /* Prevents: `sms:null?…` or `sms:+?…`, which some handlers reject. */
    expect(buildSmsUrl('Hi', undefined)).toBe('sms:?&body=Hi');
  });
});

describe('canUseNativeShare', () => {
  const original = { share: navigator.share, canShare: navigator.canShare };
  afterEach(() => {
    Object.assign(navigator, original);
  });

  it('is false where the platform has no share sheet', () => {
    /* Prevents: a "More…" row that throws `navigator.share is not a function`
       on desktop Firefox. */
    Object.assign(navigator, { share: undefined, canShare: undefined });
    expect(canUseNativeShare({ text: 'x' })).toBe(false);
  });

  it('asks canShare when it exists, and trusts share alone when it does not', () => {
    /* Prevents: offering a share sheet that the browser would refuse for this
       payload — and, the other way round, hiding it on older Safari, which has
       `share` without `canShare`. */
    Object.assign(navigator, { share: jest.fn(), canShare: () => false });
    expect(canUseNativeShare({ text: 'x' })).toBe(false);
    Object.assign(navigator, { share: jest.fn(), canShare: undefined });
    expect(canUseNativeShare({ text: 'x' })).toBe(true);
  });
});

describe('isShareAbort', () => {
  it('recognises a dismissed platform sheet and nothing else', () => {
    /* Prevents: an error toast every time a merchant closes the Android share
       sheet without picking an app. */
    expect(isShareAbort(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isShareAbort({ name: 'AbortError' })).toBe(true);
    expect(isShareAbort(new Error('NotAllowedError'))).toBe(false);
    expect(isShareAbort(null)).toBe(false);
  });
});

describe('formatPhoneForDisplay (QA O6)', () => {
  /* Prevents QA O6: the reminder sheet's "To …" line printed the mobile
     exactly as stored — "09812345678", "+91 98123 45679", "+919812345678" —
     three spellings of the same kind of number on the line whose whole job
     is to let the merchant check the recipient before WhatsApp opens. It
     reads through the SAME normaliser the links use, so the number shown is
     the number the link dials. */
  it.each([
    ['+919812345678', '+91 98123 45678'],
    ['09812345678', '+91 98123 45678'],
    ['9812345678', '+91 98123 45678'],
    ['+91 98123 45679', '+91 98123 45679'],
    ['0091-98123-45678', '+91 98123 45678'],
    ['+91 098123 45678', '+91 98123 45678'],
  ])('shows the Indian mobile %s as %s', (raw, shown) => {
    expect(formatPhoneForDisplay(raw)).toBe(shown);
  });

  it.each([
    ['+44 20 7946 0958', '+44 20 7946 0958'],
    ['+1 (415) 555-0100', '+1 (415) 555-0100'],
  ])('shows a foreign number %s as it was stored', (raw, shown) => {
    expect(formatPhoneForDisplay(raw)).toBe(shown);
  });

  it('shows an unreadable number as stored rather than guess at it', () => {
    expect(formatPhoneForDisplay(' 12345 ')).toBe('12345');
  });

  it('is empty for nothing', () => {
    expect(formatPhoneForDisplay(null)).toBe('');
    expect(formatPhoneForDisplay(undefined)).toBe('');
  });
});

describe('toDialableNumber — what a tel: link dials and Copy copies (QA O6 follow-up)', () => {
  /* The khata header printed the mobile as stored ("09812345678") while the
     reminder sheet printed "+91 98123 45678". The display now goes through
     `formatPhoneForDisplay`; the `tel:` href and the clipboard get this — the
     same normalised number, as E.164 WITH the plus and no spaces, which every
     dialler and every paste target (a contact form, a UPI app's search) reads
     the same way, and which carries the country code a national "0…" drops. */
  it.each([
    ['09812345678', '+919812345678'],
    ['+91 98123 45678', '+919812345678'],
    ['9812345678', '+919812345678'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('dials %s as %s', (raw, dialled) => {
    expect(toDialableNumber(raw)).toBe(dialled);
  });

  it('passes an unreadable number through without its spaces rather than guess', () => {
    expect(toDialableNumber(' 123 45 ')).toBe('12345');
  });

  it('is empty for nothing', () => {
    expect(toDialableNumber(null)).toBe('');
  });
});
