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

describe('where focus lands when it opens', () => {
  it('honours a control that asked for it', async () => {
    /**
     * Prevents: `autoFocus` inside a drawer or dialog doing nothing at all.
     *
     * `MLDialog` moved focus to the FIRST focusable element in the panel, which
     * is the close button in the header, and four callers had already written
     * `autoFocus` expecting otherwise — LED-01's amount field, PTY-05's tag
     * name, and the Cancel button in both archive dialogs, which is there so a
     * destructive confirmation opens on the safe choice.
     *
     * None of them worked, and nothing failed. On the ledger drawer it cost two
     * things at once: the numeric keypad did not come up on a phone, on the
     * screen whose whole target is eight seconds from tap to saved; and the
     * blur that followed marked the amount TOUCHED, so `mode: 'onTouched'` ran
     * the resolver against an empty field and the drawer opened with
     * "Enter an amount." already under it, in error red, before the merchant
     * had done anything.
     *
     * jsdom does not reproduce it — this test does, because it asserts where
     * focus IS rather than what the markup asks for. A screenshot from a real
     * browser is what found it.
     */
    render(
      <UbDrawer
        open
        onOpenChange={jest.fn()}
        title="Add entry"
        closeLabel="Close"
        footer={<button type="button">Save</button>}
      >
        <input aria-label="Amount" autoFocus />
      </UbDrawer>
    );

    expect(screen.getByLabelText('Amount')).toHaveFocus();
  });

  it('falls back to the first focusable when nothing asked', () => {
    /** The behaviour every other dialog in the product relies on, unchanged. */
    open();

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });
});
