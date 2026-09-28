import { amountInWords, integerInWords } from './amountInWords';

/** SAL-03 BR-6 / T-SAL03-2 — protects the printed "amount in words" line. */
describe('amountInWords', () => {
  it('reads the FRD examples exactly', () => {
    expect(amountInWords('1772.00')).toBe('One thousand seven hundred seventy-two rupees only');
    expect(amountInWords('123456.50')).toBe(
      'One lakh twenty-three thousand four hundred fifty-six rupees and fifty paise only'
    );
  });

  it('groups in lakh and crore, not million', () => {
    expect(integerInWords(12_34_56_789)).toBe(
      'twelve crore thirty-four lakh fifty-six thousand seven hundred eighty-nine'
    );
    expect(amountInWords('100000')).toBe('One lakh rupees only');
  });

  it('handles zero, one rupee and a lone paisa', () => {
    expect(amountInWords('0.00')).toBe('Zero rupees only');
    expect(amountInWords('1.00')).toBe('One rupee only');
    expect(amountInWords('0.05')).toBe('Zero rupees and five paise only');
  });

  it('reads Hindi with its own words for 0–99', () => {
    expect(amountInWords('1772.00', 'hi')).toBe('एक हज़ार सात सौ बहत्तर रुपये मात्र');
    expect(amountInWords('250.75', 'hi')).toBe('दो सौ पचास रुपये और पचहत्तर पैसे मात्र');
  });
});
