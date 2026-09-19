import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbChartCard } from './UbChartCard';

const TABLE = {
  caption: 'Receivables by age',
  columns: [
    { key: 'bucket', label: 'Age' },
    { key: 'amount', label: 'Amount', numeric: true },
  ],
  rows: [{ key: '0_30', cells: ['0–30 days', '₹42,000.00'] }],
};

const LABELS = { chart: 'Chart', table: 'Table' };

describe('UbChartCard — the table view is reachable, not decorative', () => {
  it('names and describes the chart with the same strings the reader sees', () => {
    render(
      <UbChartCard
        title="Receivables aging"
        description="What you are owed, by how long it has been owed."
        table={TABLE}
        viewLabels={LABELS}
      >
        {(a11y) => (
          <div role="group" aria-labelledby={a11y.labelledBy} aria-describedby={a11y.describedBy}>
            chart
          </div>
        )}
      </UbChartCard>
    );

    const group = screen.getByRole('group', { name: 'Receivables aging' });
    expect(group).toHaveAccessibleDescription('What you are owed, by how long it has been owed.');
  });

  it('swaps the chart for the same numbers as a real table', async () => {
    const user = userEvent.setup();
    render(
      <UbChartCard
        title="Receivables aging"
        description="Owed, by age."
        table={TABLE}
        viewLabels={LABELS}
      >
        {() => <div>chart</div>}
      </UbChartCard>
    );

    expect(screen.getByRole('button', { name: 'Chart' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Table' }));

    const table = screen.getByRole('table', { name: 'Receivables by age' });
    expect(table).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '₹42,000.00' })).toBeInTheDocument();
    expect(screen.queryByText('chart')).not.toBeInTheDocument();
  });
});
