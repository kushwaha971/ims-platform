import { render, screen, within } from '@testing-library/react';

import { UbPanel } from './UbPanel';

describe('UbPanel as a list', () => {
  /**
   * WP-03 D-04d — the three "which bills does this money go to" lists (apply
   * an advance, allocate a payment, apply a deposit) each hand-built a
   * bordered `ul` with `divide-y`, because `UbPanel` could not be a list: it
   * puts a divider DIV between its sections, which is not allowed inside a
   * `ul` and makes a screen reader announce the wrong number of items.
   */
  it('renders each section as a list item, with no element between them', () => {
    render(
      <UbPanel as="ul" aria-label="Open bills">
        <span>INV/26-27/0001</span>
        {false}
        <span>INV/26-27/0002</span>
      </UbPanel>
    );
    const list = screen.getByRole('list', { name: 'Open bills' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(list.children).toHaveLength(2);
    expect(items[1]).toHaveTextContent('INV/26-27/0002');
  });

  it('keeps its divider elements when it is not a list', () => {
    const { container } = render(
      <UbPanel>
        <span>Business</span>
        <span>Terms</span>
      </UbPanel>
    );
    expect(container.firstElementChild?.children).toHaveLength(3);
  });
});
