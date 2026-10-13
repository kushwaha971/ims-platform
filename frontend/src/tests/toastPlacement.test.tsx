import { fireEvent, screen } from '@testing-library/react';

import { UbSnackbar } from 'src/design-system';
import { renderWithProviders } from 'src/tests/renderWithProviders';

/** B19: the toast must clear a wrapped page header and move above mobile furniture. */
it('anchors toasts below the actual header on desktop and above bottom bars on mobile', () => {
  const header = document.createElement('header');
  header.setAttribute('data-ub-page-header', '');
  header.getBoundingClientRect = () =>
    ({ top: 76, bottom: 220, width: 900, height: 144 }) as DOMRect;
  document.body.append(header);
  try {
    renderWithProviders(
      <UbSnackbar
        message="Saved a customer"
        severity="success"
        onDismiss={jest.fn()}
        dismissLabel="Dismiss"
        autoHideMs={0}
      />
    );
    const viewport = screen.getByTestId('snackbar').parentElement?.parentElement;
    expect(viewport).toHaveClass('bottom-toast', 'lg:bottom-auto', 'lg:right-0');
    expect(viewport?.style.getPropertyValue('--ub-toast-top')).toBe('236px');
    header.getBoundingClientRect = () =>
      ({ top: 76, bottom: 260, width: 900, height: 184 }) as DOMRect;
    fireEvent.resize(window);
    expect(viewport?.style.getPropertyValue('--ub-toast-top')).toBe('276px');
  } finally {
    header.remove();
  }
});
