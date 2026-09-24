/**
 * SAL-03 BR-6 / T-SAL03-2 — the amount in words on a printed invoice, in
 * Indian grouping (thousand, lakh, crore) and with "paise" when the amount is
 * not whole. English and Hindi, because the A4 prints bilingual labels for a
 * Hindi tenant (§5).
 *
 *   1772.00    → "One thousand seven hundred seventy-two rupees only"
 *   123456.50  → "One lakh twenty-three thousand four hundred fifty-six rupees
 *                 and fifty paise only"
 *
 * Takes the wire string, never a float, and reads the digits directly.
 */

const EN_ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
]; // prettier-ignore
const EN_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

/* Hindi numerals 0–99 are not compositional — each is its own word. */
const HI_0_99 = (
  'शून्य एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह ' +
  'उन्नीस बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस ' +
  'तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चवालीस ' +
  'पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन ' +
  'अट्ठावन उनसठ साठ इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर ' +
  'बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उनासी अस्सी इक्यासी बयासी तिरासी ' +
  'चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानबे बानबे तिरानबे चौरानबे पचानबे ' +
  'छियानबे सत्तानबे अट्ठानबे निन्यानबे'
).split(' ');

type Locale = 'en' | 'hi';

const UNITS: Record<Locale, { hundred: string; thousand: string; lakh: string; crore: string }> = {
  en: { hundred: 'hundred', thousand: 'thousand', lakh: 'lakh', crore: 'crore' },
  hi: { hundred: 'सौ', thousand: 'हज़ार', lakh: 'लाख', crore: 'करोड़' },
};

const below100 = (n: number, locale: Locale): string => {
  if (locale === 'hi') return HI_0_99[n] as string;
  if (n < 20) return EN_ONES[n] as string;
  const tens = EN_TENS[Math.floor(n / 10)] as string;
  return n % 10 ? `${tens}-${EN_ONES[n % 10]}` : tens;
};

const below1000 = (n: number, locale: Locale): string[] => {
  const parts: string[] = [];
  if (n >= 100) parts.push(below100(Math.floor(n / 100), locale), UNITS[locale].hundred);
  if (n % 100) parts.push(below100(n % 100, locale));
  return parts;
};

/** A whole number in words with Indian grouping; crores recurse for very large values. */
export const integerInWords = (n: number, locale: Locale = 'en'): string => {
  if (n === 0) return below100(0, locale);
  const units = UNITS[locale];
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(integerInWords(crore, locale), units.crore);
  if (lakh) parts.push(below100(lakh, locale), units.lakh);
  if (thousand) parts.push(below100(thousand, locale), units.thousand);
  if (rest) parts.push(...below1000(rest, locale));
  return parts.join(' ');
};

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const amountInWords = (value: string, locale: Locale = 'en'): string => {
  const [wholeRaw = '0', fractionRaw = ''] = value.replace(/[^\d.]/g, '').split('.');
  const rupees = Number(wholeRaw || '0');
  const paise = Number(`${fractionRaw}00`.slice(0, 2));
  if (locale === 'hi') {
    const head = `${integerInWords(rupees, 'hi')} रुपये`;
    return paise ? `${head} और ${integerInWords(paise, 'hi')} पैसे मात्र` : `${head} मात्र`;
  }
  const head = `${integerInWords(rupees)} ${rupees === 1 ? 'rupee' : 'rupees'}`;
  const text = paise ? `${head} and ${integerInWords(paise)} paise only` : `${head} only`;
  return capitalise(text);
};
