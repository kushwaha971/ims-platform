import { render, screen } from '@testing-library/react';

import { PartyMetaCell } from './PartyListRow';

/** B17: a customer code must not hide the phone number beside it. */
it('allows contact details to wrap instead of clipping the phone', () => {
  render(<PartyMetaCell text="C-001 · +91 98765 43210" wrap />);
  expect(screen.getByText('C-001 · +91 98765 43210')).not.toHaveClass('truncate');
});
