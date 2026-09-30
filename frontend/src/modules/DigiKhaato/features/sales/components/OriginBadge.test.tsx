import { screen } from '@testing-library/react';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { OriginBadge } from './OriginBadge';

/**
 * A5 (FRD 00 PLT-X05 §8) — the badge reads "From Gym · Membership M-0042", in the module's
 * words after ours, and is plain text until the module registers a path in `originLinks.ts`.
 */
describe('OriginBadge', () => {
  it("names the module and the module's own label", () => {
    renderWithProviders(
      <OriginBadge
        origin={{ module: 'gym', type: 'gym_membership', id: 'm1', label: 'Membership M-0042' }}
      />
    );
    expect(screen.getByTestId('origin-badge')).toHaveTextContent('From Gym · Membership M-0042');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says only the module when the module gave no label', () => {
    renderWithProviders(
      <OriginBadge
        origin={{ module: 'hospitality', type: 'hospitality_folio', id: 'f1', label: null }}
      />
    );
    expect(screen.getByTestId('origin-badge')).toHaveTextContent('From Hotel');
  });
});
