import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbDrawer } from './UbDrawer';

const open = (extra: Partial<React.ComponentProps<typeof UbDrawer>> = {}) =>
  render(
    <UbDrawer
      open
      onOpenChange={jest.fn()}
      title="Add party"
      closeLabel="Close"
      footer={<button type="button">Save party</button>}
      {...extra}
    >
      <input aria-label="Name" />
    </UbDrawer>
  );

describe('the long form', () => {
  it('is a dialog with a name, so a screen reader announces what it is', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Add party' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('keeps the actions outside the scrolling body', () => {
    // A Save button that has to be scrolled to, in a form this long, is a form
    // people abandon halfway.
    open();
    const save = screen.getByRole('button', { name: 'Save party' });
    expect(save.closest('[data-testid="ml-dialog-body"]')).toBeNull();
  });

  it('can refuse a backdrop tap, which is how a dirty form survives one', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    open({ onOpenChange, dismissOnBackdrop: false });

    const backdrop = document.querySelector('[aria-hidden="true"].absolute');
    if (backdrop) await user.click(backdrop);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes on Escape, because every overlay in this product does', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    open({ onOpenChange });

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
