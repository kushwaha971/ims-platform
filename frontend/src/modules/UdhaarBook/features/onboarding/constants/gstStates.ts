import type { Locale } from 'src/types/domain.types';

/**
 * PLT-03 §7 / §10 — the GST state list, 38 rows plus `97 Other Territory`.
 *
 * The names live HERE, in a constant, and not in `locales/*.json`. Two reasons,
 * and they are the same reason twice: these are proper nouns fixed by statute,
 * not product copy — nobody will ever revise "Maharashtra" in a copy review —
 * and putting 78 keys into the locale files would swamp `i18n:check`'s output
 * with rows that can never drift.
 *
 * `state_code` is the first two characters of a GSTIN (FR-3), which is why the
 * code is the value and the name is only ever the label.
 *
 * EC-4: `97` (Other Territory) is accepted and is in this list. `99` (Centre
 * jurisdiction) is not a place a business is registered in and is absent, which
 * is how it comes to be rejected without a second rule anywhere.
 */
export interface GstState {
  readonly code: string;
  readonly en: string;
  readonly hi: string;
}

export const GST_STATES: readonly GstState[] = [
  { code: '01', en: 'Jammu and Kashmir', hi: 'जम्मू और कश्मीर' },
  { code: '02', en: 'Himachal Pradesh', hi: 'हिमाचल प्रदेश' },
  { code: '03', en: 'Punjab', hi: 'पंजाब' },
  { code: '04', en: 'Chandigarh', hi: 'चंडीगढ़' },
  { code: '05', en: 'Uttarakhand', hi: 'उत्तराखंड' },
  { code: '06', en: 'Haryana', hi: 'हरियाणा' },
  { code: '07', en: 'Delhi', hi: 'दिल्ली' },
  { code: '08', en: 'Rajasthan', hi: 'राजस्थान' },
  { code: '09', en: 'Uttar Pradesh', hi: 'उत्तर प्रदेश' },
  { code: '10', en: 'Bihar', hi: 'बिहार' },
  { code: '11', en: 'Sikkim', hi: 'सिक्किम' },
  { code: '12', en: 'Arunachal Pradesh', hi: 'अरुणाचल प्रदेश' },
  { code: '13', en: 'Nagaland', hi: 'नागालैंड' },
  { code: '14', en: 'Manipur', hi: 'मणिपुर' },
  { code: '15', en: 'Mizoram', hi: 'मिज़ोरम' },
  { code: '16', en: 'Tripura', hi: 'त्रिपुरा' },
  { code: '17', en: 'Meghalaya', hi: 'मेघालय' },
  { code: '18', en: 'Assam', hi: 'असम' },
  { code: '19', en: 'West Bengal', hi: 'पश्चिम बंगाल' },
  { code: '20', en: 'Jharkhand', hi: 'झारखंड' },
  { code: '21', en: 'Odisha', hi: 'ओडिशा' },
  { code: '22', en: 'Chhattisgarh', hi: 'छत्तीसगढ़' },
  { code: '23', en: 'Madhya Pradesh', hi: 'मध्य प्रदेश' },
  { code: '24', en: 'Gujarat', hi: 'गुजरात' },
  { code: '25', en: 'Daman and Diu', hi: 'दमन और दीव' },
  { code: '26', en: 'Dadra and Nagar Haveli and Daman and Diu', hi: 'दादरा और नगर हवेली और दमन और दीव' },
  { code: '27', en: 'Maharashtra', hi: 'महाराष्ट्र' },
  { code: '28', en: 'Andhra Pradesh (old)', hi: 'आंध्र प्रदेश (पुराना)' },
  { code: '29', en: 'Karnataka', hi: 'कर्नाटक' },
  { code: '30', en: 'Goa', hi: 'गोवा' },
  { code: '31', en: 'Lakshadweep', hi: 'लक्षद्वीप' },
  { code: '32', en: 'Kerala', hi: 'केरल' },
  { code: '33', en: 'Tamil Nadu', hi: 'तमिलनाडु' },
  { code: '34', en: 'Puducherry', hi: 'पुदुचेरी' },
  { code: '35', en: 'Andaman and Nicobar Islands', hi: 'अंडमान और निकोबार द्वीपसमूह' },
  { code: '36', en: 'Telangana', hi: 'तेलंगाना' },
  { code: '37', en: 'Andhra Pradesh', hi: 'आंध्र प्रदेश' },
  { code: '38', en: 'Ladakh', hi: 'लद्दाख' },
  { code: '97', en: 'Other Territory', hi: 'अन्य क्षेत्र' },
];

export const GST_STATE_CODES: readonly string[] = GST_STATES.map((state) => state.code);

/** The label in the active locale; the code itself when it is not a known one. */
export const stateName = (code: string | null | undefined, locale: Locale): string => {
  if (!code) return '';
  const found = GST_STATES.find((state) => state.code === code);
  return found ? found[locale] : code;
};
