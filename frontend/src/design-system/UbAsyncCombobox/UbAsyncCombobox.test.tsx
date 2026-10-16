import { useState } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbAsyncCombobox } from './UbAsyncCombobox';

const OPTIONS = [
  { value: 'k001', label: 'Kirana item K001' },
  { value: 'k002', label: 'Kirana item K002' },
];

function Line({ afterPick }: Readonly<{ afterPick?: () => void }>): React.JSX.Element {
  const [value, setValue] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  return (
    <>
      <UbAsyncCombobox
        aria-label="Item, line 1"
        value={value}
        selectedLabel={OPTIONS.find((o) => o.value === value)?.label}
        query={query}
        onQueryChange={setQuery}
        options={OPTIONS}
        onSelect={(option) => setValue(option.value)}
        afterPick={afterPick}
      />
      <input aria-label="Qty, line 1" defaultValue="1" />
    </>
  );
}

describe('UbAsyncCombobox after a pick', () => {
  /**
   * WP-05's timed counter run found this: the item was picked by Enter, the
   * list closed, and Radix put the caret back on the item trigger — so the
   * quantity the merchant typed next ("2") reopened the item search with "2"
   * in it instead of going into Qty. Moving the caret from `onSelect` does not
   * work either, because Radix's own return to the trigger runs after it.
   * `afterPick` runs in place of that return, and only after a pick.
   */
  it('moves the caret where the caller says instead of back to the trigger', async () => {
    const user = userEvent.setup();
    render(<Line afterPick={() => screen.getByLabelText('Qty, line 1').focus()} />);

    await user.click(screen.getByRole('combobox', { name: 'Item, line 1' }));
    await user.click(await screen.findByRole('option', { name: /K002/ }));

    await waitFor(() => expect(screen.getByLabelText('Qty, line 1')).toHaveFocus());
    expect(screen.getByRole('combobox', { name: 'Item, line 1' })).toHaveTextContent('K002');
  });

  it('still returns the caret to the trigger when the list is closed without a pick', async () => {
    const user = userEvent.setup();
    const afterPick = jest.fn();
    render(<Line afterPick={afterPick} />);

    await user.click(screen.getByRole('combobox', { name: 'Item, line 1' }));
    await screen.findByRole('option', { name: /K001/ });
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Item, line 1' })).toHaveFocus()
    );
    expect(afterPick).not.toHaveBeenCalled();
  });
});

describe('UbAsyncCombobox when Enter beats the search', () => {
  /**
   * The timed counter run keyed "K003" and Enter faster than the search
   * answered, and the line got K001 — the top row of the answer still on
   * screen. Enter while `pending` is held, and taken by the first row of the
   * answer that arrives for what was typed.
   */
  it('picks the first row of the fresh answer, not the stale one on screen', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    const STALE = [
      { value: 'k001', label: 'Kirana item K001' },
      { value: 'k003', label: 'Kirana item K003' },
    ];
    const FRESH = [{ value: 'k003', label: 'Kirana item K003' }];
    function Picker({ pending }: Readonly<{ pending: boolean }>): React.JSX.Element {
      return (
        <UbAsyncCombobox
          aria-label="Item, line 1"
          value={null}
          query="K003"
          onQueryChange={() => undefined}
          options={pending ? STALE : FRESH}
          pending={pending}
          onSelect={onSelect}
        />
      );
    }
    const view = render(<Picker pending />);
    await user.click(screen.getByRole('combobox', { name: 'Item, line 1' }));
    await screen.findByRole('option', { name: /K001/ });
    await user.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled();

    view.rerender(<Picker pending={false} />);
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSelect).toHaveBeenCalledWith(FRESH[0]);
  });

  /**
   * Line 31 of the timed 50-line run: the answer for "K031" was on screen and
   * Enter did nothing. The list had been replaced under cmdk, whose highlight
   * still named a row of the old answer, so no row was highlighted and Enter
   * had nothing to take. Enter with no highlighted row takes the first.
   */
  it('takes the first row when the list was replaced and nothing is highlighted', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    const OLD = [{ value: 'k030', label: 'Kirana item K030' }];
    const NEW = [{ value: 'k031', label: 'Kirana item K031' }];
    function Picker({ options }: Readonly<{ options: typeof OLD }>): React.JSX.Element {
      return (
        <UbAsyncCombobox
          aria-label="Item, line 31"
          value={null}
          query="K031"
          onQueryChange={() => undefined}
          options={options}
          onSelect={onSelect}
        />
      );
    }
    const view = render(<Picker options={OLD} />);
    await user.click(screen.getByRole('combobox', { name: 'Item, line 31' }));
    await screen.findByRole('option', { name: /K030/ });
    view.rerender(<Picker options={NEW} />);
    const fresh = await screen.findByRole('option', { name: /K031/ });
    // What the browser showed: no row highlighted. jsdom's cmdk re-highlights
    // on its own, so the state is set the way cmdk reads it (from the DOM).
    fresh.setAttribute('aria-selected', 'false');
    fresh.removeAttribute('data-selected');
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(NEW[0]);
  });
});
