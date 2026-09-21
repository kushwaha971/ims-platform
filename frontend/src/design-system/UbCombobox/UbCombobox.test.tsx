import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbCombobox } from './UbCombobox';

/**
 * Isolating the combobox, because in the running app its popover did not open:
 * `aria-expanded` stayed false after a click and no content ever mounted. The
 * drawer, built on the same vendored library, works — so this is about this
 * component, not about ml-uikit.
 */
const OPTIONS = [
  { value: '27', label: 'Maharashtra' },
  { value: '09', label: 'Uttar Pradesh' },
  { value: '29', label: 'Karnataka' },
];

function Harness({ invalid }: Readonly<{ invalid?: boolean }>) {
  return (
    <UbCombobox
      value=""
      onChange={() => undefined}
      options={OPTIONS}
      placeholder="Choose your state"
      searchPlaceholder="Search states"
      emptyLabel="No state matches that."
      invalid={invalid}
      aria-label="State"
    />
  );
}

describe('UbCombobox', () => {
  it('opens on click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'State' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByPlaceholderText('Search states')).toBeInTheDocument();
  });

  it('filters as you type, which is the whole reason it exists', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.type(await screen.findByPlaceholderText('Search states'), 'maha');

    expect(await screen.findByRole('option', { name: /Maharashtra/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Karnataka/ })).not.toBeInTheDocument();
  });

  it('says so when nothing matches, rather than showing an empty box', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.type(await screen.findByPlaceholderText('Search states'), 'zzz');

    expect(await screen.findByText('No state matches that.')).toBeInTheDocument();
  });

  it('carries the error colour under aria-invalid, beating ml-uikit’s literal hex', () => {
    render(<Harness invalid />);
    // ml-uikit's own trigger ships `aria-invalid:border-[#ff3b30]`, and twMerge
    // cannot collapse a variant class against a base one — so the token has to
    // be restated under the same variant or the library's pink wins.
    expect(screen.getByRole('combobox', { name: 'State' }).className).toContain(
      'aria-invalid:border-formError'
    );
  });
});
