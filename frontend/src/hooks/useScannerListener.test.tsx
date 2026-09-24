import { createEvent, fireEvent, render } from '@testing-library/react';

import { useScannerListener } from './useScannerListener';

/**
 * INV-02 FR-6 — a barcode scanner is a keyboard that types very fast. The
 * listener must tell a scan (a burst ending in Enter) from a person typing,
 * and must stay out of text fields, where the field itself owns the scan.
 */

function Probe({ onScan }: Readonly<{ onScan: (code: string) => void }>) {
  useScannerListener(onScan);
  return <input aria-label="search" />;
}

/* jsdom ignores `timeStamp` in an event's init dict, so it is pinned on the
   event itself — the listener measures gaps from it, as a browser's does. */
const key = (target: Element, value: string, stamp: number) => {
  const event = createEvent.keyDown(target, { key: value });
  Object.defineProperty(event, 'timeStamp', { value: stamp });
  fireEvent(target, event);
};

const burst = (text: string, gapMs: number, target: Element = document.body) => {
  let t = 1000;
  for (const char of text) {
    key(target, char, t);
    t += gapMs;
  }
  key(target, 'Enter', t - gapMs + Math.min(gapMs, 10));
};

describe('useScannerListener', () => {
  it('reports a fast burst ending in Enter as one scan', () => {
    const onScan = jest.fn();
    render(<Probe onScan={onScan} />);
    burst('8901234567890', 10);
    expect(onScan).toHaveBeenCalledWith('8901234567890');
  });

  it('ignores a person typing the same characters slowly', () => {
    // A merchant pressing "1234 Enter" on a list page must not be taken for
    // a scanner and navigated to an item.
    const onScan = jest.fn();
    render(<Probe onScan={onScan} />);
    burst('1234', 200);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('ignores a burst shorter than four characters', () => {
    const onScan = jest.fn();
    render(<Probe onScan={onScan} />);
    burst('12', 5);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('leaves a scan into a text field to that field', () => {
    // The search box treats a scan as typed text plus Enter (FR-7); a second
    // handler here would navigate away while the list also searched.
    const onScan = jest.fn();
    const { getByLabelText } = render(<Probe onScan={onScan} />);
    burst('8901234567890', 10, getByLabelText('search'));
    expect(onScan).not.toHaveBeenCalled();
  });
});
