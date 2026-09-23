import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbDialog } from 'src/design-system/UbDialog';

import { UbCombobox } from './UbCombobox';

const OPTIONS = [
  { value: '27', label: 'Maharashtra' },
  { value: '29', label: 'Karnataka' },
];

describe('UbCombobox inside an overlay', () => {
  /**
   * The same defect `UbTokenInput` had, fixed in the same pass and asserted
   * here because the exposure is not this component's fault and will come back
   * the next time somebody puts it in a dialog.
   *
   * Radix portals the menu out of the overlay's DOM subtree, so the overlay's
   * Escape handler and this one are two listeners on the same document with no
   * knowledge of each other — and the overlay's was registered first. The GST
   * state picker, this component's original caller, sits on a PAGE and was
   * never affected; PTY-05's merge dialog is the first caller inside an
   * overlay, which is how a two-year-old component grew a new bug without
   * changing.
   */
  it('closes its menu and leaves the overlay it is inside alone', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();

    render(
      <UbDialog
        open
        onOpenChange={onOpenChange}
        title="Merge tags"
        closeLabel="Close"
        footer={null}
      >
        <UbCombobox
          value={null}
          onChange={jest.fn()}
          options={OPTIONS}
          aria-label="Keep this tag"
          placeholder="Choose a tag"
          searchPlaceholder="Search"
          emptyLabel="Nothing found"
        />
      </UbDialog>
    );

    await user.click(screen.getByRole('combobox', { name: 'Keep this tag' }));
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByPlaceholderText('Search')).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('still closes on Escape when it is not inside anything', async () => {
    /** The fix must not make the ordinary case — the GST state picker on a
     *  page — stop responding to the key at all. */
    const user = userEvent.setup();
    render(
      <UbCombobox
        value={null}
        onChange={jest.fn()}
        options={OPTIONS}
        aria-label="State"
        searchPlaceholder="Search"
        emptyLabel="Nothing found"
      />
    );

    await user.click(screen.getByRole('combobox', { name: 'State' }));
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByPlaceholderText('Search')).not.toBeInTheDocument();
  });
});
