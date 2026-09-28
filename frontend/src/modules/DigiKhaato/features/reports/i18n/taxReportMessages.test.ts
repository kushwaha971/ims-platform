import en from 'locales/en.json';

import {
  ITC_FILTERS,
  REGISTER_PARTY_FILTERS,
  REGISTER_STATUS_FILTERS,
  SALES_KIND_FILTERS,
  TAX_PERIOD_PRESETS,
} from '../constants/taxReportConstants';

import { TAX_REPORT_MESSAGES } from './taxReportMessages';

/**
 * The route-local tax-report catalogue gets the guarantee `check-locales.mjs`
 * gives the shell one: every key in both languages, no empty string, no key
 * the shell also defines — and every key a screen BUILDS from data (a period,
 * a GSTR-1 nature, an exception code, a GSTR-3B box) exists, because a
 * missing one renders its raw id, which is the statement's
 * `ledger.entry.type.manual_got` defect.
 */
const { en: EN, hi: HI } = TAX_REPORT_MESSAGES;

it('has the same keys in English and Hindi, none empty, none in the shell', () => {
  expect(Object.keys(HI).sort()).toEqual(Object.keys(EN).sort());
  const shell = en as Record<string, string>;
  for (const [key, value] of Object.entries(EN)) {
    expect(value.trim()).not.toBe('');
    expect(HI[key]?.trim()).not.toBe('');
    expect(shell[key]).toBeUndefined();
  }
});

it('has a label for every value a screen turns into a key', () => {
  const built = [
    ...TAX_PERIOD_PRESETS.map((v) => `reports.period.${v}`),
    ...REGISTER_STATUS_FILTERS.map((v) => `reports.register.status.${v}`),
    ...REGISTER_PARTY_FILTERS.map((v) => `reports.salesRegister.party.${v}`),
    ...SALES_KIND_FILTERS.map((v) => `reports.salesRegister.kind.${v}`),
    ...ITC_FILTERS.map((v) => `reports.purchaseRegister.itc.${v}`),
    ...['document', 'line'].map((v) => `reports.register.level.${v}`),
    ...['gstr1', 'gstr3b', 'details'].map((v) => `reports.gst.view.${v}`),
    ...['b2b', 'b2b_rcm', 'b2cl', 'b2cs', 'cdnr', 'cdnur', 'nil_exempt', 'advances'].map(
      (v) => `reports.gst.nature.${v}`
    ),
    ...['invoices_outward', 'credit_notes'].map((v) => `reports.gst.docs.${v}`),
    ...[
      'missing_party_gstin',
      'invalid_gstin_checksum',
      'missing_hsn',
      'missing_pos',
      'pos_state_mismatch',
      'legacy_rate_used',
      'cn_without_original',
      'zero_taxable_with_tax',
    ].map((v) => `reports.gst.issue.${v}`),
    ...['3.1(a)', '3.1(b)', '3.1(c)', '3.1(d)', '3.1(e)', '4(A)(3)', '4(A)(5)', '4(B)'].map(
      (v) => `reports.gst.box.${v}`
    ),
    ...['sales', 'purchase'].flatMap((book) =>
      ['title', 'caption', 'empty.title', 'tile.due'].map((k) => `reports.${book}Register.${k}`)
    ),
  ];
  expect(built.filter((key) => !(key in EN))).toEqual([]);
});

it('keeps the portal vocabulary untranslated in Hindi', () => {
  expect(HI['reports.gst.view.gstr1']).toBe('GSTR-1');
  expect(HI['reports.salesRegister.party.b2b']).toBe('B2B');
  expect(HI['reports.gst.title']).toBe('जीएसटी सारांश');
  expect(HI['reports.salesRegister.title']).toBe('बिक्री रजिस्टर');
  expect(HI['reports.purchaseRegister.title']).toBe('खरीद रजिस्टर');
});
