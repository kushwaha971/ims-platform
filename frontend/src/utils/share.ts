/**
 * The deep links a share sheet opens — pure, so the encoding and the number
 * rules are tested once here rather than rediscovered in every caller.
 *
 * ── Why the client builds these at all ─────────────────────────────────────
 * NTF-03 FR-2 wants the SERVER to compose share text and `wa_url`, and LED-06
 * FR-2 has it log a `ledger_reminder` row while it does. Neither table exists,
 * and DEC-012 says nothing is sent by the server anyway: the merchant sends the
 * message from their own WhatsApp or their own SMS app. What the product can
 * honestly do today is hand them a link that opens that app with the words
 * already typed. The day the reminder endpoint lands, `wa_url` comes from the
 * response and `buildWhatsAppUrl` is what the tests compare it against.
 *
 * ── The number ─────────────────────────────────────────────────────────────
 * `wa.me` wants E.164 WITHOUT the plus (`919812345678`); an `sms:` URI wants a
 * global number WITH it (`+919812345678`, RFC 5724). A party's mobile is stored
 * as E.164, but a pasted or legacy value can be anything a shopkeeper types —
 * `098123 45678`, `+91 98123-45678`, `0091 9812345678` — and India is the only
 * market, so a bare ten-digit number is an Indian mobile.
 *
 * A number that cannot be read is NOT guessed at. It returns `null`, and the
 * links fall back to their number-less forms (`https://wa.me/?text=` lets the
 * merchant pick the chat; `sms:?&body=` opens a new message with no recipient).
 * Sending somebody's balance to a number the product half-parsed is the one
 * failure here that cannot be taken back.
 *
 * ── The text ───────────────────────────────────────────────────────────────
 * `encodeURIComponent`, which is UTF-8 percent-encoding: `₹` is `%E2%82%B9`,
 * Devanagari is three bytes a letter, a newline is `%0A`. It also encodes `&`,
 * `#`, `?`, `=` and `+` — the five characters that would otherwise end the
 * `text` parameter early, start a fragment, or (for `+`) be read back as a
 * space by a form decoder. `\r\n` is folded to `\n` first so a pasted Windows
 * line ending does not reach the chat as a stray `%0D`.
 */

/** India is the only market (PLT-01), so a national number is an Indian one. */
const INDIA_COUNTRY_CODE = '91';
const NATIONAL_DIGITS = 10;
/** E.164 allows at most fifteen digits; the shortest real numbers are eight. */
const E164_MIN = 8;
const E164_MAX = 15;

/**
 * Any spelling of a phone number → E.164 digits without the plus, or `null`.
 *
 * `+91 98123 45678`, `919812345678`, `09812345678`, `9812345678` and
 * `0091-98123-45678` all read as `919812345678`. `+91 098123 45678` — a trunk
 * zero kept after the country code, which people do write — reads the same.
 */
export const toWhatsAppDigits = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  let international = trimmed.startsWith('+');

  // `00` is the international access prefix — the same thing as a `+`.
  if (!international && digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }

  if (international) {
    // "+91 0XXXXXXXXXX": the trunk zero survives the country code by habit.
    if (digits.startsWith(`${INDIA_COUNTRY_CODE}0`) && digits.length === NATIONAL_DIGITS + 3) {
      digits = INDIA_COUNTRY_CODE + digits.slice(3);
    }
    return digits.length >= E164_MIN && digits.length <= E164_MAX ? digits : null;
  }

  // National spellings. A trunk zero first, then the ten digits themselves.
  if (digits.length === NATIONAL_DIGITS + 1 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === NATIONAL_DIGITS) return INDIA_COUNTRY_CODE + digits;
  if (digits.length === NATIONAL_DIGITS + 2 && digits.startsWith(INDIA_COUNTRY_CODE)) {
    return digits;
  }
  return null;
};

/** Newlines normalised, then UTF-8 percent-encoded — see the header. */
export const encodeShareText = (text: string): string =>
  encodeURIComponent(text.replace(/\r\n?/g, '\n'));

/**
 * `https://wa.me/<digits>?text=<encoded>`, or `https://wa.me/?text=<encoded>`
 * when there is no readable number — WhatsApp then asks who to send it to.
 *
 * `wa.me` and not `api.whatsapp.com/send`: it is the documented short form, it
 * opens the app on a phone and WhatsApp Web on a laptop, and it is the URL
 * LED-06 BR-2 specifies for the server to build.
 */
export const buildWhatsAppUrl = (text: string, phone?: string | null): string => {
  const digits = toWhatsAppDigits(phone);
  return `https://wa.me/${digits ?? ''}?text=${encodeShareText(text)}`;
};

/**
 * `sms:<+E.164>?&body=<encoded>` — the one spelling both platforms read.
 *
 * iOS historically parsed `sms:<n>&body=` and Android `sms:<n>?body=`; the
 * `?&body=` form puts an empty first parameter before `body`, which iOS 8+ and
 * every Android messaging app accept. With no number it is `sms:?&body=`, a
 * new message with the recipient left for the merchant to choose.
 */
export const buildSmsUrl = (text: string, phone?: string | null): string => {
  const digits = toWhatsAppDigits(phone);
  return `sms:${digits ? `+${digits}` : ''}?&body=${encodeShareText(text)}`;
};

/**
 * Whether the platform share sheet (`navigator.share`) can take this text.
 *
 * `canShare` is consulted when it exists because a browser can expose `share`
 * and still refuse a payload; where it does not exist, `share` alone is the
 * answer (Safari shipped `share` years before `canShare`).
 */
export const canUseNativeShare = (data: { title?: string; text: string }): boolean => {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare(data);
    } catch {
      return false;
    }
  }
  return true;
};

/**
 * A dismissed platform sheet rejects with `AbortError`. That is the merchant
 * changing their mind, not a failure, and it must not raise an error toast.
 */
export const isShareAbort = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { name?: unknown }).name === 'AbortError';
