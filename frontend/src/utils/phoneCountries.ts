/**
 * The country list behind `UbPhoneInput`'s picker, kept apart from
 * `src/utils/phone.ts` on purpose: the validation every form route loads needs
 * only the E.164 shape, and this table is about 1 KB gzipped that only a
 * screen WITH a mobile field should pay. Importing it from the validator put
 * it on fifty routes, `/login` among them (the bundle gate, 9 Oct 2026).
 */

import { DEFAULT_PHONE_COUNTRY, E164_MAX_DIGITS } from 'src/utils/phone';

export { DEFAULT_PHONE_COUNTRY };

export interface PhoneCountry {
  /** ISO 3166-1 alpha-2, `IN`. */
  readonly iso: string;
  /** The calling code without the plus, `91`. */
  readonly dial: string;
}

/**
 * `ISO` + dial code, space-separated. Where countries share a code (+1, +7,
 * +44, +39, +47, +61, +212, +262, +358, +590, +599) the one listed FIRST is
 * what a number with that code is read as when nothing else says otherwise —
 * so those come first.
 */
const TABLE =
  'IN91 US1 RU7 GB44 IT39 NO47 AU61 MA212 RE262 FI358 GP590 CW599 ' +
  'AF93 AL355 DZ213 AS1 AD376 AO244 AI1 AG1 AR54 AM374 AW297 AT43 AZ994 BS1 BH973 BD880 BB1 ' +
  'BY375 BE32 BZ501 BJ229 BM1 BT975 BO591 BA387 BW267 BR55 IO246 VG1 BN673 BG359 BF226 BI257 ' +
  'KH855 CM237 CA1 CV238 KY1 CF236 TD235 CL56 CN86 CX61 CC61 CO57 KM269 CG242 CD243 CK682 ' +
  'CR506 CI225 HR385 CU53 CY357 CZ420 DK45 DJ253 DM1 DO1 EC593 EG20 SV503 GQ240 ER291 EE372 ' +
  'SZ268 ET251 FK500 FO298 FJ679 FR33 GF594 PF689 GA241 GM220 GE995 DE49 GH233 GI350 GR30 ' +
  'GL299 GD1 GU1 GT502 GG44 GN224 GW245 GY592 HT509 HN504 HK852 HU36 IS354 ID62 IR98 IQ964 ' +
  'IE353 IM44 IL972 JM1 JP81 JE44 JO962 KZ7 KE254 KI686 XK383 KW965 KG996 LA856 LV371 LB961 ' +
  'LS266 LR231 LY218 LI423 LT370 LU352 MO853 MG261 MW265 MY60 MV960 ML223 MT356 MH692 MQ596 ' +
  'MR222 MU230 YT262 MX52 FM691 MD373 MC377 MN976 ME382 MS1 MZ258 MM95 NA264 NR674 NP977 ' +
  'NL31 NC687 NZ64 NI505 NE227 NG234 NU683 NF672 KP850 MK389 MP1 OM968 PK92 PW680 PS970 ' +
  'PA507 PG675 PY595 PE51 PH63 PL48 PT351 PR1 QA974 RO40 RW250 BL590 SH290 KN1 LC1 MF590 ' +
  'PM508 VC1 WS685 SM378 ST239 SA966 SN221 RS381 SC248 SL232 SG65 SX1 SK421 SI386 SB677 ' +
  'SO252 ZA27 KR82 SS211 ES34 LK94 SD249 SR597 SJ47 SE46 CH41 SY963 TW886 TJ992 TZ255 TH66 ' +
  'TL670 TG228 TK690 TO676 TT1 TN216 TR90 TM993 TC1 TV688 VI1 UG256 UA380 AE971 UY598 ' +
  'UZ998 VU678 VA39 VE58 VN84 WF681 EH212 YE967 ZM260 ZW263 BQ599 AX358';

export const PHONE_COUNTRIES: readonly PhoneCountry[] = TABLE.split(' ').map((entry) => ({
  iso: entry.slice(0, 2),
  dial: entry.slice(2),
}));

const BY_ISO = new Map(PHONE_COUNTRIES.map((country) => [country.iso, country]));

/** The country for an ISO code; India for anything unknown. */
export const phoneCountry = (iso: string | null | undefined): PhoneCountry =>
  (iso && BY_ISO.get(iso)) || (BY_ISO.get(DEFAULT_PHONE_COUNTRY) as PhoneCountry);

/** Dial codes are one to three digits and prefix-free between countries. */
const MAX_DIAL_DIGITS = 3;

/**
 * The country a `+…` number belongs to, by its dial code, or null.
 *
 * `prefer` breaks a shared code: `+1416…` stays Canada while Canada is the
 * country the field has chosen, instead of snapping to the United States.
 */
export const countryOfE164 = (
  value: string | null | undefined,
  prefer?: string | null
): PhoneCountry | null => {
  const trimmed = (value ?? '').trim();
  if (!trimmed.startsWith('+')) return null;
  const digits = trimmed.replace(/\D/g, '');
  const preferred = prefer ? BY_ISO.get(prefer) : undefined;
  if (preferred && digits.startsWith(preferred.dial)) return preferred;
  for (let length = MAX_DIAL_DIGITS; length >= 1; length -= 1) {
    const dial = digits.slice(0, length);
    const match = PHONE_COUNTRIES.find((country) => country.dial === dial);
    if (match) return match;
  }
  return null;
};

/** How many national digits a country's field takes: ten for India. */
export const nationalDigitLimit = (country: PhoneCountry): number =>
  country.iso === DEFAULT_PHONE_COUNTRY ? 10 : E164_MAX_DIGITS - country.dial.length;
