import { render, screen } from '@testing-library/react';

import { UbQrCode } from 'src/design-system';

/**
 * Moved with the component from `features/sales` (R33, A16). The encoder,
 * `apps/common/qr.py`, is tested against the standard's vectors; this protects
 * the PAINTING of its output: one square per dark module, inside a
 * four-module quiet zone, from the barrel every module now imports it from.
 */
it('paints one square per dark module inside a four-module quiet zone', () => {
  render(<UbQrCode modules={['101', '010', '101']} size="28mm" label="Scan to pay" />);
  const svg = screen.getByRole('img', { name: 'Scan to pay' });
  expect(svg.getAttribute('viewBox')).toBe('0 0 11 11');
  const path = svg.querySelector('path')?.getAttribute('d') ?? '';
  expect(path.match(/M/g)).toHaveLength(5);
  expect(path.startsWith('M4,4h1v1h-1z')).toBe(true);
});
