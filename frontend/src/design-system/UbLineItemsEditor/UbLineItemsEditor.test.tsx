import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFieldArray, useForm } from 'react-hook-form';

import {
  UbLineItemsEditor,
  type UbLineCellLayout,
  type UbLineItemsColumn,
} from './UbLineItemsEditor';

/**
 * The line-items editor is built to the INVOICE requirement (Part 32 §32.9.7)
 * even though INV-06's adjustment drawer is its first caller: a counter clerk
 * keys a bill without touching the mouse. These tests protect the keyboard
 * contract and the phone layout — the two things SAL-02 inherits and would
 * otherwise discover broken with a customer waiting.
 */

interface Line {
  name: string;
  qty: string;
}

interface FormShape {
  lines: Line[];
}

const COLUMNS: UbLineItemsColumn[] = [
  {
    id: 'name',
    header: 'Item',
    field: 'name',
    card: 'title',
    render: ({ field, id, label }) => (
      <input
        id={id}
        aria-label={label}
        value={String(field?.value ?? '')}
        onChange={(event) => field?.onChange(event.target.value)}
      />
    ),
  },
  {
    id: 'qty',
    header: 'Qty',
    field: 'qty',
    render: ({ field, id, label }) => (
      <input
        id={id}
        aria-label={label}
        value={String(field?.value ?? '')}
        onChange={(event) => field?.onChange(event.target.value)}
      />
    ),
  },
  {
    id: 'echo',
    header: 'Echo',
    render: ({ index }) => <output data-testid={`echo-${index}`}>{index + 1}</output>,
  },
];

function Harness({
  initial,
  layout = 'table',
  onSubmit,
  maxLines,
}: Readonly<{
  initial: Line[];
  layout?: UbLineCellLayout;
  onSubmit?: () => void;
  maxLines?: number;
}>) {
  const { control } = useForm<FormShape>({ defaultValues: { lines: initial } });
  const fieldArray = useFieldArray({ control, name: 'lines', keyName: 'key' });
  return (
    <UbLineItemsEditor<FormShape, 'lines'>
      control={control}
      name="lines"
      fieldArray={fieldArray}
      columns={COLUMNS}
      newLine={() => ({ name: '', qty: '' })}
      layout={layout}
      maxLines={maxLines}
      onSubmitShortcut={onSubmit}
      labels={{
        addLine: 'Add line',
        removeLine: (n) => `Remove line ${n}`,
        lineLabel: (n) => `line ${n}`,
        empty: 'No lines yet',
        maxReached: 'That is the most lines one entry takes',
      }}
    />
  );
}

describe('keyboard-first entry', () => {
  it('Enter moves to the next cell, then to the next line', async () => {
    // A till operator types "qty, Enter, next item" — Enter submitting the
    // form halfway through a bill would post half a bill.
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { name: 'Rice', qty: '' },
          { name: 'Dal', qty: '' },
        ]}
      />
    );
    await user.click(screen.getByLabelText('Item, line 1'));
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Qty, line 1')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Item, line 2')).toHaveFocus();
  });

  it('Enter from the last cell of the last line opens a new line and focuses it', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ name: 'Rice', qty: '2' }]} />);
    await user.click(screen.getByLabelText('Qty, line 1'));
    await user.keyboard('{Enter}');
    expect(await screen.findByLabelText('Item, line 2')).toHaveFocus();
  });

  it('arrow keys keep the column while changing the line', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { name: 'Rice', qty: '1' },
          { name: 'Dal', qty: '2' },
        ]}
      />
    );
    await user.click(screen.getByLabelText('Qty, line 1'));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByLabelText('Qty, line 2')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByLabelText('Qty, line 1')).toHaveFocus();
  });

  it('Alt+N adds a line and Alt+Backspace removes the current one', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ name: 'Rice', qty: '1' }]} />);
    await user.click(screen.getByLabelText('Item, line 1'));
    await user.keyboard('{Alt>}n{/Alt}');
    expect(await screen.findByLabelText('Item, line 2')).toHaveFocus();
    await user.keyboard('{Alt>}{Backspace}{/Alt}');
    expect(screen.queryByLabelText('Item, line 2')).not.toBeInTheDocument();
  });

  it('Ctrl+Enter is the submit shortcut, not a line move', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<Harness initial={[{ name: 'Rice', qty: '1' }]} onSubmit={onSubmit} />);
    await user.click(screen.getByLabelText('Item, line 1'));
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Item, line 1')).toHaveFocus();
  });

  it('stops adding at maxLines and says why', async () => {
    // INV-06 caps an adjustment at 100 lines; a button that silently does
    // nothing reads as broken.
    const user = userEvent.setup();
    render(<Harness initial={[{ name: 'Rice', qty: '1' }]} maxLines={1} />);
    expect(screen.getByRole('button', { name: 'Add line' })).toBeDisabled();
    expect(screen.getByText('That is the most lines one entry takes')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Qty, line 1'));
    await user.keyboard('{Enter}');
    expect(screen.queryByLabelText('Item, line 2')).not.toBeInTheDocument();
  });
});

describe('the phone layout', () => {
  it('renders each line as a card with the title column on top and one input per field', () => {
    // Both layouts in the DOM at once would give every field two inputs and
    // two Controllers fighting over one value.
    render(
      <Harness
        layout="card"
        initial={[
          { name: 'Rice', qty: '1' },
          { name: 'Dal', qty: '2' },
        ]}
      />
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'line 2' });
    expect(within(card).getAllByLabelText('Item, line 2')).toHaveLength(1);
    expect(within(card).getAllByLabelText('Qty, line 2')).toHaveLength(1);
    expect(within(card).getByText('Echo')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Remove line 2' })).toBeInTheDocument();
  });

  it('QA S-D8: never names a "line 0"; remove buttons are 1-based', () => {
    render(<Harness initial={[{ name: 'Rice', qty: '1' }]} />);
    expect(screen.queryByText('Remove line 0')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove line 1' })).toBeInTheDocument();
  });

  it('shows the empty message when there are no lines', () => {
    render(<Harness layout="card" initial={[]} />);
    expect(screen.getByText('No lines yet')).toBeInTheDocument();
  });
});

/**
 * Sprint 12 a11y sweep (axe aria-required-children, critical): the table
 * layout's remove button sat directly in its `row`, beside the cells, and the
 * empty message directly in the `table`. An ARIA row owns only cells and a
 * table only rows, so a screen reader's table navigation skipped the button and
 * mis-counted the columns on every invoice, estimate and bill editor.
 */
describe('ARIA table ownership in the table layout', () => {
  it('puts every control in a cell and every row under the table', () => {
    render(<Harness initial={[{ name: 'Rice', qty: '2' }]} />);
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    const line = rows[1] as HTMLElement;
    for (const control of [
      ...within(line).getAllByRole('button'),
      ...within(line).getAllByRole('textbox'),
    ]) {
      expect(control.closest('[role="cell"]')).not.toBeNull();
    }
    const remove = within(line).getByRole('button', { name: 'Remove line 1' });
    expect(remove.closest('[role="row"]')).toBe(line);
  });

  it('wraps the empty message in a row and a cell', () => {
    render(<Harness initial={[]} />);
    const message = screen.getByText('No lines yet');
    expect(message.closest('[role="cell"]')).not.toBeNull();
    expect(message.closest('[role="row"]')?.parentElement).toBe(screen.getByRole('table'));
  });
});
