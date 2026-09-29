import { act, render, screen } from '@testing-library/react';

import { UbRotatingText } from './UbRotatingText';

/**
 * The rotator is decoration over a sentence the caller states in full, so its
 * tests are about what it must NOT do: speak, shift the line, or move for a
 * person who asked for less motion.
 */
const WORDS = ['udhaar', 'GST bills', 'stock', 'payments'];
const setReduced = (reduced: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
};
const active = () =>
  Array.from(screen.getByTestId('ub-rotator').children).find(
    (child) => child.getAttribute('data-state') === 'in'
  )?.textContent;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('UbRotatingText', () => {
  it('is hidden from assistive technology — the caller states the sentence', () => {
    setReduced(false);
    render(<UbRotatingText words={WORDS} />);

    expect(screen.getByTestId('ub-rotator')).toHaveAttribute('aria-hidden', 'true');
  });

  /** Every word in one grid cell is what reserves the widest word's width. */
  it('renders every word at once, starting on the first', () => {
    setReduced(false);
    render(<UbRotatingText words={WORDS} />);

    expect(screen.getByTestId('ub-rotator').children).toHaveLength(4);
    expect(active()).toBe('udhaar');
  });

  it('moves to the next word every interval', () => {
    setReduced(false);
    render(<UbRotatingText words={WORDS} intervalMs={2400} />);

    act(() => {
      jest.advanceTimersByTime(2400);
    });
    expect(active()).toBe('GST bills');
    act(() => {
      jest.advanceTimersByTime(2400 * 3);
    });
    expect(active()).toBe('udhaar');
  });

  it('stays frozen on the first word under reduced motion', () => {
    setReduced(true);
    render(<UbRotatingText words={WORDS} intervalMs={2400} />);

    act(() => {
      jest.advanceTimersByTime(2400 * 5);
    });
    expect(active()).toBe('udhaar');
  });
});
