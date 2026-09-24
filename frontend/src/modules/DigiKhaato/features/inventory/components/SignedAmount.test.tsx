import { render } from '@testing-library/react';

import { SignedAmount } from './SignedAmount';

/**
 * The first look at INV-06 showed a ₹6,500 theft's value impact as
 * "₹6,500.00" — `UbAmount` draws a magnitude and leaves direction to a label,
 * and an adjustment's value change has no direction word. A write-off and a
 * find of the same size were indistinguishable in the drawer's footer.
 */
describe('SignedAmount', () => {
  it('draws stock written off with a true minus sign', () => {
    const { container } = render(<SignedAmount value="-6500.00" label="Value impact" />);
    expect(container.textContent).toContain('−');
    expect(container.textContent).toContain('6,500.00');
  });

  it('draws stock found with a plus sign', () => {
    const { container } = render(<SignedAmount value="150.00" label="Value impact" />);
    expect(container.textContent).toContain('+');
  });

  it('leaves a zero unsigned', () => {
    // §23.2.6 rule 4: a zero is never signed.
    const { container } = render(<SignedAmount value="0.00" label="Value impact" />);
    expect(container.textContent).not.toMatch(/[+−]/);
  });
});
