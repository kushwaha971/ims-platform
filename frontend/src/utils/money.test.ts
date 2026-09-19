import {
  addMoney,
  compareMoney,
  formatAmount,
  formatInr,
  isZeroAmount,
  subtractMoney,
  sumMoney,
  toMoneyString,
} from './money';

/**
 * R-T-1 — a pure module gets a unit test, and money is where the expensive bugs
 * live. Part 19 §19.11.5: Indian grouping, always two decimals, and arithmetic
 * over strings rather than floats.
 */
describe('money', () => {
  it('formats with Indian (2,2,3) grouping and two decimals', () => {
    expect(formatInr('123456.5')).toBe('₹1,23,456.50');
    expect(formatInr('1234.5')).toBe('₹1,234.50');
    expect(formatInr('10000000')).toBe('₹1,00,00,000.00');
    expect(formatInr('0')).toBe('₹0.00');
  });

  it('renders an absent value as an em dash rather than ₹0.00', () => {
    expect(formatInr(null)).toBe('—');
    expect(formatInr('')).toBe('—');
    expect(formatAmount(undefined)).toBe('—');
  });

  it('formats without the symbol for table columns', () => {
    expect(formatAmount('123456.5')).toBe('1,23,456.50');
  });

  it('adds and subtracts without float error', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in floating point; not here.
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(subtractMoney('1000.00', '999.99')).toBe('0.01');
    expect(sumMoney(['10.10', '20.20', '30.30'])).toBe('60.60');
  });

  it('normalises any accepted input to the wire form', () => {
    expect(toMoneyString('5')).toBe('5.00');
    expect(toMoneyString(1234.5)).toBe('1234.50');
  });

  it('compares as decimals, not as strings', () => {
    // '9.00' > '10.00' as strings; as money it is not.
    expect(compareMoney('9.00', '10.00')).toBe(-1);
    expect(compareMoney('10.00', '10.00')).toBe(0);
    expect(compareMoney('10.01', '10.00')).toBe(1);
  });

  it('treats an absent value as zero, because a zero is never red', () => {
    expect(isZeroAmount('0.00')).toBe(true);
    expect(isZeroAmount(null)).toBe(true);
    expect(isZeroAmount('0.01')).toBe(false);
  });
});
