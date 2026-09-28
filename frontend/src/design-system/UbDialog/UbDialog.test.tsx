import { useRef, useState } from 'react';

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

  it('stacks the footer in DOM order when asked, so Tab follows the screen (D-L6)', () => {
    /* Prevents D-L6: the only footer on offer reversed its actions below `sm`,
       so a three-action sheet was tabbed bottom-up. The default keeps the
       convention; `as-written` is the opt-out, and it must actually drop the
       reversal rather than add a class that loses to it. */
    const footer = (
      <>
        <UbButton variant="secondary">Cancel</UbButton>
        <UbButton>Confirm</UbButton>
      </>
    );
    const { rerender } = render(
      <UbDialog open onOpenChange={jest.fn()} title="Order" closeLabel="Dismiss" footer={footer} />
    );
    const row = () => screen.getByRole('button', { name: 'Cancel' }).parentElement as HTMLElement;
    expect(row()).toHaveClass('flex-col-reverse');

    rerender(
      <UbDialog
        open
        onOpenChange={jest.fn()}
        title="Order"
        closeLabel="Dismiss"
        footer={footer}
        footerOrder="as-written"
      />
    );
    expect(row()).toHaveClass('flex-col');
    expect(row()).not.toHaveClass('flex-col-reverse');
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

describe('UbDialog — returning focus when the opener is not there to receive it (QA D1)', () => {
  /**
   * Prevents QA defect D1: closing a dialog dropped focus on <body> (WCAG
   * 2.4.3) in the two situations the khata's ⋯ menu produces. Neither is
   * visible to a test that opens a dialog from a plain button that stays put.
   */
  function LazyMount({ autoFocusInside }: Readonly<{ autoFocusInside?: boolean }>) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <UbButton onClick={() => setOpen(true)}>Open</UbButton>
        {/* `{open && <Dialog open />}` — how every lazily loaded dialog is
            rendered: the primitive MOUNTS already open. */}
        {open && (
          <UbDialog open onOpenChange={setOpen} title="Lazy" closeLabel="Dismiss">
            <UbButton autoFocus={autoFocusInside}>Cancel</UbButton>
          </UbDialog>
        )}
      </>
    );
  }

  it.each([
    ['without', false],
    ['with', true],
  ])(
    'returns focus to the opener of a dialog that mounts open, %s an autoFocus inside',
    async (_l, autoFocusInside) => {
      const user = userEvent.setup();
      render(<LazyMount autoFocusInside={autoFocusInside} />);
      const opener = screen.getByRole('button', { name: 'Open' });
      opener.focus();
      await user.keyboard('{Enter}');
      expect(screen.getByRole('dialog', { name: 'Lazy' })).toBeInTheDocument();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    }
  );

  function OpenerRemoved() {
    const [menuOpen, setMenuOpen] = useState(true);
    const [open, setOpen] = useState(false);
    const fallbackRef = useRef<HTMLButtonElement | null>(null);
    return (
      <>
        <UbButton ref={fallbackRef}>More</UbButton>
        {/* A menu item that disappears as it opens the dialog. */}
        {menuOpen && (
          <UbButton
            onClick={() => {
              setOpen(true);
              setMenuOpen(false);
            }}
          >
            Send reminder
          </UbButton>
        )}
        <UbDialog
          open={open}
          onOpenChange={setOpen}
          title="Remind"
          closeLabel="Dismiss"
          returnFocusRef={fallbackRef}
        />
      </>
    );
  }

  it('returns focus to returnFocusRef when the remembered opener has left the document', async () => {
    const user = userEvent.setup();
    render(<OpenerRemoved />);
    screen.getByRole('button', { name: 'Send reminder' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('button', { name: 'Send reminder' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus();
  });
});
