import { render, screen } from '@testing-library/react';

import { CHART_EMPHASIS_FILL, CHART_RECESSIVE_FILL } from '../chartPalette';

import { UB_RANKED_BARS_CAP, UbRankedBars } from './UbRankedBars';

const PARTIES = [
  { id: 'p1', name: 'Rajesh Traders', amount: '84200.00' },
  { id: 'p2', name: 'Shree Balaji Kirana Stores', amount: '51300.00' },
  { id: 'p3', name: 'Meenakshi Provision Store', amount: '38750.00' },
  { id: 'p4', name: 'Gupta Electricals & Hardware', amount: '24100.00' },
  { id: 'p5', name: 'Annapurna Sweets', amount: '17600.00' },
  { id: 'p6', name: 'Nakoda Cloth House', amount: '12450.00' },
  { id: 'p7', name: 'Vaibhav Mobile Point', amount: '9800.00' },
];

describe('UbRankedBars', () => {
  it('emphasises the first bar and recedes the rest — one hue plus grey', () => {
    const { container } = render(
      <UbRankedBars parties={PARTIES} labelledBy="t" describedBy="d" moreLabel="and 2 more" />
    );
    const bars = Array.from(container.querySelectorAll('li path:last-of-type'));
    expect(bars[0]?.getAttribute('class')).toBe(CHART_EMPHASIS_FILL);
    bars.slice(1).forEach((bar) => {
      expect(bar.getAttribute('class')).toBe(CHART_RECESSIVE_FILL);
    });
  });

  it('caps the chart at five and says how many are not drawn', () => {
    render(
      <UbRankedBars parties={PARTIES} labelledBy="t" describedBy="d" moreLabel="and 2 more" />
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(UB_RANKED_BARS_CAP);
    expect(screen.getByText('and 2 more')).toBeInTheDocument();
    expect(screen.queryByText('Nakoda Cloth House')).not.toBeInTheDocument();
  });

  it('says nothing about an overflow when there is none', () => {
    render(
      <UbRankedBars
        parties={PARTIES.slice(0, 3)}
        labelledBy="t"
        describedBy="d"
        moreLabel="and 2 more"
      />
    );
    expect(screen.queryByText('and 2 more')).not.toBeInTheDocument();
  });

  it('keeps a long party name readable — ellipsis plus the full string', () => {
    render(<UbRankedBars parties={PARTIES} labelledBy="t" describedBy="d" />);
    const name = screen.getByTitle('Shree Balaji Kirana Stores');
    expect(name.className).toContain('truncate');
  });

  it('speaks each bar as a name and an amount', () => {
    render(<UbRankedBars parties={PARTIES} labelledBy="t" describedBy="d" />);
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute(
      'aria-label',
      'Rajesh Traders, ₹84,200.00'
    );
  });
});
