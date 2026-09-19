import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CHART_AGING_RAMP } from '../chartPalette';

import { UbAgingBars } from './UbAgingBars';

const BUCKETS = [
  { key: '0_30', label: '0–30 days', amount: '42000.00' },
  { key: '31_60', label: '31–60 days', amount: '18500.00' },
  { key: '61_90', label: '61–90 days', amount: '9250.00' },
  { key: '90_plus', label: '90+ days', amount: '31000.00' },
];

const renderChart = (buckets = BUCKETS) =>
  render(
    <>
      <h3 id="t">Receivables aging</h3>
      <p id="d">Owed, by age.</p>
      <UbAgingBars buckets={buckets} labelledBy="t" describedBy="d" />
    </>
  );

describe('UbAgingBars', () => {
  it('labels every bucket in words as well as in colour', () => {
    renderChart();
    for (const bucket of BUCKETS) {
      expect(screen.getByText(bucket.label)).toBeInTheDocument();
    }
  });

  it('direct-labels every bar with its rupee figure, Indian-grouped', () => {
    renderChart();
    expect(screen.getByText('₹42,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹9,250.00')).toBeInTheDocument();
  });

  it('paints the buckets in ramp order — older is a later step', () => {
    const { container } = renderChart();
    const bars = Array.from(container.querySelectorAll('li path:last-of-type'));
    bars.forEach((bar, index) => {
      expect(bar.getAttribute('class')).toBe(CHART_AGING_RAMP[index]?.fill);
    });
  });

  it('scales every bar against ONE axis, so the bars are comparable', () => {
    const { container } = renderChart();
    const widths = Array.from(container.querySelectorAll('li')).map((row) => {
      const path = row.querySelectorAll('path')[1];
      const match = /L (\d+(?:\.\d+)?) /.exec(path?.getAttribute('d') ?? '');
      return Number(match?.[1] ?? 0);
    });
    // 42,000 : 18,500 ≈ the ratio of the first two bars, within the corner radius.
    const [first, second] = widths;
    expect((first ?? 0) / (second ?? 1)).toBeCloseTo(42000 / 18500, 1);
  });

  it('gives each bucket a 44 px hit target with a spoken name', () => {
    renderChart();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveAttribute('aria-label', '0–30 days, ₹42,000.00');
    expect(rows[0]?.className).toContain('min-h-[44px]');
  });

  it('shows the same readout on keyboard focus as on hover', async () => {
    const user = userEvent.setup();
    renderChart();
    await user.tab();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('draws no bar for a zero bucket rather than a stub of one', () => {
    const { container } = renderChart([
      { key: '0_30', label: '0–30 days', amount: '0.00' },
      { key: '31_60', label: '31–60 days', amount: '100.00' },
    ]);
    const rows = Array.from(container.querySelectorAll('li'));
    expect(rows[0]?.querySelectorAll('path')).toHaveLength(1); // the track only
    expect(rows[1]?.querySelectorAll('path')).toHaveLength(2);
  });
});
