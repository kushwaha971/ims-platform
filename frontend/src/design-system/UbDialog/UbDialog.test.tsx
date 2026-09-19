import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbButton } from 'src/design-system/UbButton';
import { UbConfirmDialog } from 'src/design-system/UbConfirmDialog';
import { UbDialog } from 'src/design-system/UbDialog';

/**
 * The `ml-uikit` stand-in has no Radix, so the portal, the focus trap, the
 * Escape handling and the focus restore are implemented locally (see
 * `mlOverlayPrimitives.tsx`). This file is what makes that claim checkable: if
 * any of it is a fake, these fail.
 */
describe('UbDialog', () => {
  it('renders nothing while closed', () => {
    render(
      <UbDialog open={false} onOpenChange={jest.fn()} title="Plan limit" closeLabel="Dismiss">
        <p>Body</p>
      </UbDialog>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a modal dialog labelled by its own title', () => {
    render(
      <UbDialog
        open
        onOpenChange={jest.fn()}
        title="Plan limit reached"
        description="You have used 3 of 3."
        closeLabel="Dismiss"
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Plan limit reached' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('You have used 3 of 3.');
  });

  it('moves focus into the dialog when it opens', () => {
    render(
      <UbDialog open onOpenChange={jest.fn()} title="Plan limit" closeLabel="Dismiss">
        <UbButton>Inside</UbButton>
      </UbDialog>
    );
    // The first focusable thing, which is the close control.
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    render(<UbDialog open onOpenChange={onOpenChange} title="Plan limit" closeLabel="Dismiss" />);

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('traps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(
      <UbDialog open onOpenChange={jest.fn()} title="Plan limit" closeLabel="Dismiss">
        <UbButton>Only action</UbButton>
      </UbDialog>
    );

    await user.tab();
    await user.tab();
    await user.tab();

    // Whatever the cycle, focus never leaves the dialog.
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('locks the page behind it from scrolling', () => {
    const { unmount } = render(
      <UbDialog open onOpenChange={jest.fn()} title="Plan limit" closeLabel="Dismiss" />
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('can hide the close control for a decision that must be made', () => {
    render(
      <UbDialog
        open
        onOpenChange={jest.fn()}
        title="Plan limit"
        closeLabel="Dismiss"
        showClose={false}
      />
    );
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });
});

describe('UbConfirmDialog — PLT-04 FR-7', () => {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    title: 'Leave this business?',
    description: 'You will lose access until somebody invites you again.',
    confirmLabel: 'Leave business',
    cancelLabel: 'Cancel',
    closeLabel: 'Dismiss',
    onConfirm: jest.fn(),
  };

  it('names the ACT on the confirm button, not "OK"', () => {
    render(<UbConfirmDialog {...props} />);
    expect(screen.getByRole('button', { name: 'Leave business' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
  });

  it('states the consequence as the description', () => {
    render(<UbConfirmDialog {...props} />);
    expect(
      screen.getByText('You will lose access until somebody invites you again.')
    ).toBeInTheDocument();
  });

  it('does not dismiss a destructive confirm on a backdrop tap', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    const { container } = render(
      <UbConfirmDialog {...props} onOpenChange={onOpenChange} destructive />
    );

    // A stray tap on a phone is not consent.
    const backdrop = container.ownerDocument.querySelector('[aria-hidden="true"].absolute');
    if (backdrop) await user.click(backdrop);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('calls back on confirm and on cancel', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    const onOpenChange = jest.fn();
    render(<UbConfirmDialog {...props} onConfirm={onConfirm} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'Leave business' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables both actions while the request is in flight', () => {
    render(<UbConfirmDialog {...props} busy busyLabel="Leaving…" />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Leaving…' })).toBeDisabled();
  });
});
