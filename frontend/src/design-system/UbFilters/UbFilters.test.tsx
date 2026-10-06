import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { UbActiveFilters, UbFilterSelect, UbFilterSheet, UbPeriodSelect } from './index';

import type { UbFilterSpec } from './filterTypes';

/**
 * The owner-approved filter pattern (6 Oct 2026): a dropdown for one choice of
 * many, one Filters drawer for the rest, and pills for what is on. These pin
 * the behaviour every list screen now relies on.
 */
const status: UbFilterSpec = {
  kind: 'single',
  key: 'status',
  label: 'Status',
  anyLabel: 'All',
  options: [
    { value: 'unpaid', label: 'Unpaid' },
    { value: 'paid', label: 'Paid' },
    { value: 'void', label: 'Void', disabled: true, hint: 'none yet' },
  ],
};
const modes: UbFilterSpec = {
  kind: 'multi',
  key: 'mode',
  label: 'Mode',
  options: [
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
  ],
};
const dates: UbFilterSpec = {
  kind: 'dateRange',
  key: 'date',
  label: 'Date',
  fromKey: 'from',
  toKey: 'to',
  fromLabel: 'From',
  toLabel: 'To',
};
const SHEET_LABELS = { title: 'Filters', apply: 'Apply', reset: 'Reset', close: 'Close' };

it('a dropdown shows its value, and picking a choice reports it once', async () => {
  const onChange = jest.fn();
  renderWithProviders(
    <UbFilterSelect spec={status} value="" onChange={onChange} closeLabel="Close" />
  );
  const button = screen.getByRole('button', { name: 'Status: All' });
  await userEvent.click(button);
  const list = await screen.findByRole('listbox');
  expect(within(list).getByRole('option', { name: /Void/ })).toBeDisabled();
  await userEvent.click(within(list).getByRole('option', { name: 'Unpaid' }));
  expect(onChange).toHaveBeenCalledWith('unpaid');
});

it('the Filters sheet edits a draft, applies it once, and Reset clears only the draft', async () => {
  const onApply = jest.fn();
  renderWithProviders(
    <UbFilterSheet
      specs={[status, modes, dates]}
      values={{ status: 'paid', mode: '', from: '', to: '' }}
      onApply={onApply}
      labels={SHEET_LABELS}
    />
  );
  // One filter is on, and the button says so.
  await userEvent.click(screen.getByRole('button', { name: 'Filters (1)' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'UPI' }));
  expect(onApply).not.toHaveBeenCalled();
  await userEvent.click(screen.getByTestId('filters-apply'));
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', mode: 'upi' }));
  await userEvent.click(screen.getByRole('button', { name: 'Filters (1)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
  await userEvent.click(screen.getByTestId('filters-apply'));
  expect(onApply).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: '', mode: '', from: '', to: '' })
  );
});

it('pills show only what is on, remove one at a time, and clear all', async () => {
  const onChange = jest.fn();
  renderWithProviders(
    <UbActiveFilters
      specs={[status, modes, dates]}
      values={{ status: 'unpaid', mode: 'cash,upi', from: '2026-10-01', to: '2026-10-06' }}
      onChange={onChange}
      labels={{ remove: (pill) => `Remove ${pill}`, clearAll: 'Clear all' }}
    />
  );
  expect(screen.getByText('Status: Unpaid')).toBeInTheDocument();
  expect(screen.getByText('Mode: Cash, UPI')).toBeInTheDocument();
  expect(screen.getByText('Date: 1 Oct 2026 – 6 Oct 2026')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remove Mode: Cash, UPI' }));
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: '', status: 'unpaid' })
  );
  await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  expect(onChange).toHaveBeenLastCalledWith({ status: '', mode: '', from: '', to: '' });
});

it('renders nothing when no filter is on', () => {
  const { container } = renderWithProviders(
    <UbActiveFilters
      specs={[status]}
      values={{ status: '' }}
      onChange={jest.fn()}
      labels={{ remove: (pill) => pill, clearAll: 'Clear all' }}
    />
  );
  expect(container.querySelector('[data-testid="active-filters"]')).toBeNull();
});

it('the period dropdown picks a preset, and a custom range only with both dates', async () => {
  const onChange = jest.fn();
  renderWithProviders(
    <UbPeriodSelect
      presets={[
        { value: '7d', label: 'Last 7 days' },
        { value: 'fy', label: 'This financial year' },
        { value: 'custom', label: 'Custom range' },
      ]}
      value="7d"
      customValue="custom"
      from={null}
      to={null}
      onChange={onChange}
      labels={{ period: 'Period', from: 'From', to: 'To', apply: 'Apply', close: 'Close' }}
    />
  );
  await userEvent.click(screen.getByRole('button', { name: 'Period: Last 7 days' }));
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await userEvent.click(screen.getByRole('option', { name: 'This financial year' }));
  expect(onChange).toHaveBeenCalledWith('fy', null, null);
});
