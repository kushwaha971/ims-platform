import { useEffect, useRef, useState } from 'react';


import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'react-dom';

import { UbButton } from 'src/design-system/UbButton';

import { UbActionSheet } from './UbActionSheet';
import { UbMoreActions } from './UbMoreActions';

describe('UbActionSheet close order', () => {
  /**
   * The khata menu found this first (PTY-03): a row that opens a dialog while
   * its own sheet is still mounted leaves two overlays, and Escape closes the
   * wrong one. Five feature menus each re-solved it by closing first; the
   * design-system sheet, which every page header's phone ⋯ uses, closed
   * AFTER the row's handler, on a timer.
   */
  it('closes the sheet in the same tap as the row acts, after it', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    function Harness(): React.JSX.Element {
      const [open, setOpen] = useState(true);
      return (
        <UbActionSheet
          open={open}
          onOpenChange={(next) => {
            order.push(next ? 'open' : 'close');
            setOpen(next);
          }}
          title="More actions"
          closeLabel="Close"
        >
          <UbButton onClick={() => order.push('row')}>Edit</UbButton>
        </UbActionSheet>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(order).toEqual(['row', 'close']);
    expect(screen.queryByRole('dialog', { name: 'More actions' })).not.toBeInTheDocument();
  });

  /**
   * WP-07, found by looking at a phone: Edit, Adjust stock and Archive in the
   * item page's ⋯ sheet closed the sheet and did nothing. The sheet closed in
   * the CAPTURE phase. React handles capture and bubble with two native
   * listeners, and a real tap runs a microtask checkpoint between them, which
   * flushed the close and unmounted the row before its onClick. A script
   * dispatch (jsdom, `element.click()`) has no checkpoint, so this suite passed.
   * The native listener on the row stands in for that checkpoint.
   */
  it('lets the row act when the close is flushed between capture and bubble', async () => {
    const user = userEvent.setup();
    const acted = jest.fn();
    function Harness(): React.JSX.Element {
      const [open, setOpen] = useState(true);
      const row = useRef<HTMLButtonElement | null>(null);
      useEffect(() => {
        const node = row.current;
        const checkpoint = () => flushSync(() => undefined);
        node?.addEventListener('click', checkpoint);
        return () => node?.removeEventListener('click', checkpoint);
      }, [open]);
      return (
        <UbActionSheet open={open} onOpenChange={setOpen} title="More actions" closeLabel="Close">
          <UbButton ref={row} onClick={acted}>
            Edit
          </UbButton>
        </UbActionSheet>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(acted).toHaveBeenCalledTimes(1);
  });

  it('closes before acting for rows given as data too', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    render(
      <UbActionSheet
        open
        onOpenChange={() => order.push('close')}
        title="More actions"
        closeLabel="Close"
        rows={[{ key: 'edit', label: 'Edit', onSelect: () => order.push('row') }]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(order).toEqual(['close', 'row']);
  });
});

describe('UbMoreActions', () => {
  /**
   * The ⋯ button and its sheet, which the khata, borrower and catalogue pages
   * each built by hand. A row without a handler is not drawn, and with no rows
   * there is no button: a ⋯ that opens an empty sheet teaches a merchant the
   * app is broken.
   */
  it('draws only the rows that can act, and nothing when none can', async () => {
    const user = userEvent.setup();
    const edit = jest.fn();
    const { rerender } = render(
      <UbMoreActions
        label="More"
        title="More actions"
        closeLabel="Close"
        testId="party-more"
        rows={[
          { key: 'edit', label: 'Edit', onSelect: edit, testId: 'party-edit' },
          { key: 'archive', label: 'Archive' },
        ]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    await user.click(screen.getByTestId('party-edit'));
    expect(edit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    rerender(
      <UbMoreActions
        label="More"
        title="More actions"
        closeLabel="Close"
        rows={[{ key: 'archive', label: 'Archive' }]}
      />
    );
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });
});
