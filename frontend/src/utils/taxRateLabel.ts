import type { TranslateFn } from 'src/hooks/useTranslation';

/**
 * A GST rate's name in the merchant's language.
 *
 * The rate table (`seed_reference_data`) stores English names, which do for
 * "GST 18%" in either language. They do not do for the three zero-rate
 * categories: QA P-D6 found "Exempt" and "Nil rated" untranslated on a Hindi
 * purchase bill. Those three are looked up by CODE (stable), and every other
 * rate keeps the server's name. The words are in the `money` catalogue
 * (`tax.rate.*`), which every screen with a rate picker already loads.
 */
const TRANSLATED = new Set(['EXEMPT', 'NIL', 'NONGST']);

export const taxRateLabel = (
  rate: { readonly code: string; readonly name: string },
  t: TranslateFn
): string => (TRANSLATED.has(rate.code) ? t(`tax.rate.${rate.code}`) : rate.name);
