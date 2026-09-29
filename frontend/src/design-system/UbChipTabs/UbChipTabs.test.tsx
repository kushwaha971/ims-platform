import { useState } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { UbChipTabs } from './UbChipTabs';

/**
 * `MLTabs` moves the selection on an arrow key and leaves focus behind on a
 * tab that is now `tabIndex=-1`, so the next Tab press jumps somewhere
 * unexpected. The chip row is automatic activation: the key moves both.
 */
const TABS = [
  { value: 'khata', label: 'Khata' },
  { value: 'bill', label: 'GST bill' },
  { value: 'stock', label: 'Stock' },
] as const;

function Harness() {
  const [value, setValue] = useState<(typeof TABS)[number]['value']>('khata');
  return (
    <UbChipTabs value={value} onValueChange={setValue} tabs={TABS} ariaLabel="Use cases">
      Panel for {value}
    </UbChipTabs>
  );
}

describe('UbChipTabs', () => {
  it('is a named tablist with one selected, focusable tab', () => {
    render(<Harness />);

    expect(screen.getByRole('tablist', { name: 'Use cases' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Khata' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Khata' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Stock' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel for khata');
  });

  it('moves selection AND focus with the arrow keys, wrapping at the ends', () => {
    render(<Harness />);
    const khata = screen.getByRole('tab', { name: 'Khata' });
    khata.focus();

    fireEvent.keyDown(khata, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'GST bill' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'GST bill' })).toHaveFocus();

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Stock' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel for stock');

    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Khata' })).toHaveFocus();
  });

  it('labels the panel by its tab', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stock' }));

    expect(screen.getByRole('tabpanel', { name: 'Stock' })).toBeInTheDocument();
  });
});
