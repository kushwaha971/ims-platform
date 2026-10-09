import { screen } from '@testing-library/react';

import { UbSkeleton, UbStatCard } from 'src/design-system';
import { UbStatGrid } from 'src/design-system/charts/UbStatGrid';
import { renderWithProviders } from 'src/tests/renderWithProviders';

/**
 * A collapsible stat grid (`collapse`) shows a one-line summary of its figures.
 * Pinned: while the figures are still loading skeletons there is nothing to
 * summarise, so the shimmering cards show instead of an empty line with only
 * "Details" in it — the state sprint-3 B1 caught on a phone, where the totals
 * gave no sign they were coming.
 */
const collapse = { storageKey: 'test', labels: { show: 'Details', hide: 'Hide' } };

describe('UbStatGrid collapse', () => {
  it('shows the loading cards, not an empty summary, until there are figures', () => {
    renderWithProviders(
      <UbStatGrid collapse={collapse}>
        <UbSkeleton variant="card" label="Loading totals" />
        <UbSkeleton variant="card" label="Loading totals" />
      </UbStatGrid>
    );
    expect(screen.getByTestId('ub-stat-grid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
  });

  it('summarises the figures in one line once they are there', () => {
    renderWithProviders(
      <UbStatGrid collapse={collapse}>
        <UbStatCard label="You will get" value="₹1,000.00" />
        <UbStatCard label="You will give" value="₹200.00" />
      </UbStatGrid>
    );
    expect(screen.getByTestId('stat-summary')).toHaveTextContent('You will get');
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
  });
});
