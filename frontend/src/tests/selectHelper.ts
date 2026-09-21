import { screen, within } from '@testing-library/react';

import type { UserEvent } from '@testing-library/user-event';

/**
 * Choose an option from a `UbSelect`.
 *
 * `userEvent.selectOptions` only drives a native `<select>`. `UbSelect` is now
 * ml-uikit's Radix composite — a button with `role="combobox"` and a portalled
 * listbox — so the interaction is open-then-pick, which is also what a person
 * does. Centralised here so the next test to need it does not reinvent it, and
 * so a future change to the control is one edit rather than twenty.
 */
export async function chooseOption(
  user: UserEvent,
  comboboxName: RegExp | string,
  optionName: RegExp | string
): Promise<void> {
  const trigger = screen.getByRole('combobox', { name: comboboxName });
  await user.click(trigger);
  const listbox = await screen.findByRole('listbox');
  await user.click(within(listbox).getByRole('option', { name: optionName }));
}
