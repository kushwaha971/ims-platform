import {
  compareQuantity,
  exceedsQuantity,
  remainingQuantity,
  stepQuantity,
  subtractQuantity,
  sumQuantities,
  trimQuantity,
} from './quantity';

/**
 * WP-03 D-05 — quantity arithmetic has one owner. `Number("0.3") −
 * Number("0.1")` is 0.19999999999999998, so a return cap worked out in floats
 * refused "0.2 KG" as more than could come back and printed the cap as
 * "0.19999999999999998". These helpers work in decimals, to three places, the
 * way the server stores every quantity.
 */
describe('remainingQuantity', () => {
  it('is exact to the gram, where floats are not', () => {
    expect(remainingQuantity('0.300', '0.100')).toBe('0.200');
    expect(remainingQuantity('5', '1.5')).toBe('3.500');
  });

  it('never goes below nothing', () => {
    expect(remainingQuantity('1', '3')).toBe('0.000');
  });

  it('reads a missing amount used as none', () => {
    expect(remainingQuantity('2.000', '')).toBe('2.000');
    expect(remainingQuantity('2.000', undefined)).toBe('2.000');
  });
});

describe('trimQuantity', () => {
  it.each([
    ['20.000', '20'],
    ['2.500', '2.5'],
    ['0.000', '0'],
    ['12', '12'],
    ['0.200', '0.2'],
  ])('writes %p as a person would: %p', (raw, shown) => {
    expect(trimQuantity(raw)).toBe(shown);
  });
});

describe('sumQuantities', () => {
  it('adds without float noise', () => {
    expect(sumQuantities(['0.1', '0.2'])).toBe('0.300');
    expect(sumQuantities([])).toBe('0.000');
  });
});

it('compares quantities written differently as equal', () => {
  expect(compareQuantity('0.2', '0.200')).toBe(0);
  expect(compareQuantity(remainingQuantity('0.3', '0.1'), '0.2')).toBe(0);
});

it('subtracts below nothing when a shortfall is the answer', () => {
  expect(subtractQuantity('0.3', '0.1')).toBe('0.200');
  expect(subtractQuantity('2', '10')).toBe('-8.000');
});

describe('exceedsQuantity', () => {
  it('is exact at the cap', () => {
    expect(exceedsQuantity('0.2', remainingQuantity('0.3', '0.1'))).toBe(false);
    expect(exceedsQuantity('0.201', '0.200')).toBe(true);
  });

  it('never calls half-typed text over, and never throws on it', () => {
    expect(exceedsQuantity('2.', '1')).toBe(false);
    expect(exceedsQuantity('', '1')).toBe(false);
    expect(exceedsQuantity(undefined, '1')).toBe(false);
    expect(exceedsQuantity('abc', '1')).toBe(false);
  });

  it('reads a negative stock on hand as a cap below nothing', () => {
    expect(exceedsQuantity('1', '-2.000')).toBe(true);
  });
});

describe('stepQuantity', () => {
  it.each([
    ['2', '3'],
    ['', '1'],
    ['-1', '0'],
    ['1.005', '2.005'],
  ])('counts one more after %p: %p', (raw, next) => {
    expect(stepQuantity(raw)).toBe(next);
  });

  it('leaves text that is not a number alone', () => {
    expect(stepQuantity('x')).toBe('x');
  });
});
