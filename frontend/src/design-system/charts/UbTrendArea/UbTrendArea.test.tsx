import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbTrendArea } from './UbTrendArea';

const POINTS = [
  { date: '2026-09-01', amount: '12000.00' },
  { date: '2026-09-08', amount: '18500.00' },
  { date: '2026-09-15', amount: '9400.00' },
  { date: '2026-09-22', amount: '26750.00' },
];

const renderChart = () =>
  render(
    <>
      <h3 id="t">Collections over time</h3>
      <p id="d">Money received, weekly.</p>
      <UbTrendArea points={POINTS} labelledBy="t" describedBy="d" />
    </>
  );

describe('UbTrendArea', () => {
  it('is one area series — one fill, one line, no second series', () => {
    const { container } = renderChart();
    expect(container.querySelectorAll('path.fill-accent\\/10')).toHaveLength(1);
    expect(container.querySelectorAll('path.stroke-accent')).toHaveLength(1);
  });

  it('carries an accessible name and description', () => {
    renderChart();
    const chart = screen.getByRole('img', { name: 'Collections over time' });
    expect(chart).toHaveAccessibleDescription('Money received, weekly.');
  });

  it('labels the ENDPOINT and nothing else — never a number on every point', () => {
    const { container } = renderChart();
    const svg = container.querySelector('svg');
    const texts = Array.from(svg?.querySelectorAll('text') ?? []).map((node) => node.textContent);
    expect(texts).toContain('₹26,750.00');
    // 12,000 / 18,500 / 9,400 are readable from the axis, the crosshair and the
    // table view; they are not written onto the plot.
    expect(texts).not.toContain('₹12,000.00');
    expect(texts).not.toContain('₹18,500.00');
  });

  it('draws solid hairline gridlines, never dashed ones', () => {
    const { container } = renderChart();
    const lines = Array.from(container.querySelectorAll('line'));
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((line) => {
      expect(line.getAttribute('stroke-dasharray')).toBeNull();
      expect(line.getAttribute('stroke-width')).toBe('1');
    });
  });

  it('writes its dates dd/mm, not mm/dd', () => {
    const { container } = renderChart();
    const texts = Array.from(container.querySelectorAll('text')).map((node) => node.textContent);
    expect(texts).toContain('01/09');
    expect(texts).toContain('22/09');
  });

  it('walks the series on the keyboard and announces what the tooltip shows', async () => {
    const user = userEvent.setup();
    renderChart();
    const chart = screen.getByRole('img', { name: 'Collections over time' });
    chart.focus();
    await user.keyboard('{Home}');
    expect(screen.getByText('01/09/2026, ₹12,000.00')).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('08/09/2026, ₹18,500.00')).toBeInTheDocument();
    await user.keyboard('{End}');
    expect(screen.getByText('22/09/2026, ₹26,750.00')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('22/09/2026, ₹26,750.00')).not.toBeInTheDocument();
  });

  it('renders without a crosshair until the reader asks for one', () => {
    const { container } = renderChart();
    // Only the three gridlines; the crosshair is a fourth, added on hover/focus.
    expect(container.querySelectorAll('line')).toHaveLength(3);
  });
});
