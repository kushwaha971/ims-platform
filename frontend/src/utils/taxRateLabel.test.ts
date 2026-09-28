import type { TranslateFn } from 'src/hooks/useTranslation';

import { taxRateLabel } from './taxRateLabel';

/** QA P-D6 — "Exempt" / "Nil rated" showed in English on a Hindi purchase bill. */
const HI: Record<string, string> = {
  'tax.rate.EXEMPT': 'छूट प्राप्त',
  'tax.rate.NIL': 'शून्य दर',
  'tax.rate.NONGST': 'गैर-GST आपूर्ति',
};
const t = ((id: string) => HI[id] ?? id) as TranslateFn;

it('P-D6: names the zero-rate categories in the merchant language, by code', () => {
  expect(taxRateLabel({ code: 'EXEMPT', name: 'Exempt' }, t)).toBe('छूट प्राप्त');
  expect(taxRateLabel({ code: 'NIL', name: 'Nil rated' }, t)).toBe('शून्य दर');
  expect(taxRateLabel({ code: 'NONGST', name: 'Non-GST supply' }, t)).toBe('गैर-GST आपूर्ति');
});

it('keeps the server name for a numbered rate, which reads the same in both', () => {
  expect(taxRateLabel({ code: 'GST18', name: 'GST 18%' }, t)).toBe('GST 18%');
});
