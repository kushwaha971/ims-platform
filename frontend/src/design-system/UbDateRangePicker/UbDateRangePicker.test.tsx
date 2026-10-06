import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  UbDateRangePicker,
  type UbDateRangePickerProps,
} from 'src/design-system/UbDateRangePicker';

/**
 * `UbDateRangePicker` — every screen's period, now ONE dropdown (owner, 6 Oct
 * 2026) instead of a row of chips. What matters here is the wiring: a preset
 * reports through `onPresetChange`, a custom range through `onRangeChange` and
 * only with both dates, and whatever else scopes the screen sits on the same
 * row.
 */
type Preset = 'thisMonth' | 'thisFy' | 'custom';

const PRESETS = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'thisFy', label: 'This year' },
  { value: 'custom', label: 'Custom' },
] as const;

const renderPicker = (overrides: Partial<UbDateRangePickerProps<Preset>> = {}) => {
  const props: UbDateRangePickerProps<Preset> = {
    presets: PRESETS,
    preset: 'thisFy',
    onPresetChange: jest.fn(),
    customPreset: 'custom',
    from: '2026-04-01',
    to: '2026-09-23',
    onRangeChange: jest.fn(),
    max: '2026-09-23',
    labels: { presets: 'Period', from: 'From date', to: 'To date', apply: 'Apply', close: 'Close' },
    ...overrides,
  };
  render(<UbDateRangePicker {...props} />);
  return props;
};

it('is one button naming the period, not a row of chips', () => {
  renderPicker();
  expect(screen.getByRole('button', { name: 'Period: This year' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'This month' })).toBeNull();
});

it('reports a preset through onPresetChange', async () => {
  const props = renderPicker();
  await userEvent.click(screen.getByRole('button', { name: 'Period: This year' }));
  await userEvent.click(await screen.findByRole('option', { name: 'This month' }));
  expect(props.onPresetChange).toHaveBeenCalledWith('thisMonth');
  expect(props.onRangeChange).not.toHaveBeenCalled();
});

it('shows a custom range as its dates, and applies one only with both', async () => {
  renderPicker({ preset: 'custom', from: '2026-05-01', to: '2026-05-31' });
  const button = screen.getByRole('button', { name: /^Period: 1 May 2026 – 31 May 2026$/ });
  await userEvent.click(button);
  expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
});

it('keeps the rest of the scope on the same row', () => {
  renderPicker({ end: <span>Show corrections</span> });
  expect(screen.getByTestId('scope-bar')).toHaveTextContent('Show corrections');
});
