import { useState } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
  it('closes the sheet before the row acts', async () => {
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
    expect(order).toEqual(['close', 'row']);
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
