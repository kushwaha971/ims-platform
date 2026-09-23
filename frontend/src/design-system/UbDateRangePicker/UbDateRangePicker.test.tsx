import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  UbDateRangePicker,
  type UbDateRangePickerProps,
} from 'src/design-system/UbDateRangePicker';

/**
 * `UbDateRangePicker` — the statement's period control, lifted (§32.6.4).
 *
 * `UbDateInput` is replaced with a stand-in that exposes the props it was
 * handed: its own calendar is tested in its own file, and what matters HERE is
 * the wiring — which bound each field receives and what a change reports. A
 * range whose `from` calendar is not stopped at `to` is the defect this file
 * exists to catch, and it cannot be seen by clicking through a calendar in
 * jsdom.
 */
jest.mock('src/design-system/UbDateInput', () => ({
  UbDateInput: (props: {
    name: string;
    value: string;
    min?: string;
    max?: string;
    'aria-label'?: string;
    onChange: (value: string | null) => void;
  }) => (
    <button
      type="button"
      aria-label={props['aria-label']}
      data-name={props.name}
      data-value={props.value}
      data-min={props.min ?? ''}
      data-max={props.max ?? ''}
      onClick={() => props.onChange(props.name.endsWith('from') ? '2026-05-01' : '')}
    >
      {props.value || 'empty'}
    </button>
  ),
}));

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
    labels: { presets: 'Period', from: 'From date', to: 'To date' },
    name: 'statement',
    ...overrides,
  };
  render(<UbDateRangePicker {...props} />);
  return props;
};

describe('UbDateRangePicker', () => {
  it('names its presets as a group and marks the applied one pressed', () => {
    /* Prevents: six unrelated toggles to a screen reader, and a chosen period
       that is not announced as chosen. */
    renderPicker();
    const group = screen.getByRole('group', { name: 'Period' });
    expect(within(group).getByRole('button', { name: 'This year' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(group).getByRole('button', { name: 'This month' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('chooses a preset by keyboard, and ignores re-pressing the applied one', async () => {
    /* Prevents: a period that can be turned "off" (a single choice has no
       off), and a preset reachable only by pointer. */
    const user = userEvent.setup();
    const props = renderPicker();
    await user.tab();
    expect(screen.getByRole('button', { name: 'This month' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(props.onPresetChange).toHaveBeenCalledWith('thisMonth');

    await user.click(screen.getByRole('button', { name: 'This year' }));
    expect(props.onPresetChange).toHaveBeenCalledTimes(1);
  });

  it('hides the dates until the custom preset is chosen', () => {
    /* Prevents: two date boxes beside six chips — two answers to one question,
       and on a 360 px phone the controls that push the chips off screen. */
    renderPicker();
    expect(screen.queryByRole('button', { name: 'From date' })).not.toBeInTheDocument();
  });

  it('bounds from by to, to by from, and both by max', () => {
    /* Prevents: a from-after-to range the server has to refuse, and a future
       date on a statement. */
    renderPicker({ preset: 'custom' });
    const from = screen.getByRole('button', { name: 'From date' });
    const to = screen.getByRole('button', { name: 'To date' });
    expect(from).toHaveAttribute('data-name', 'statement-from');
    expect(from).toHaveAttribute('data-max', '2026-09-23');
    expect(to).toHaveAttribute('data-name', 'statement-to');
    expect(to).toHaveAttribute('data-min', '2026-04-01');
    expect(to).toHaveAttribute('data-max', '2026-09-23');
  });

  it('stops the from calendar at to rather than at max when to is set', () => {
    /* Prevents: the from picker offering dates after the chosen end. */
    renderPicker({ preset: 'custom', to: '2026-06-30' });
    expect(screen.getByRole('button', { name: 'From date' })).toHaveAttribute(
      'data-max',
      '2026-06-30'
    );
  });

  it('reports the whole range on a change, and a cleared field as null', async () => {
    /* Prevents: a change to one end losing the other, and an empty string
       reaching the URL as `to=`. */
    const user = userEvent.setup();
    const props = renderPicker({ preset: 'custom' });
    await user.click(screen.getByRole('button', { name: 'From date' }));
    expect(props.onRangeChange).toHaveBeenLastCalledWith('2026-05-01', '2026-09-23');
    await user.click(screen.getByRole('button', { name: 'To date' }));
    expect(props.onRangeChange).toHaveBeenLastCalledWith('2026-04-01', null);
  });

  it('always shows the dates when there is no custom preset', () => {
    /* Prevents: a caller with no "Custom" chip getting no way to pick dates. */
    renderPicker({ customPreset: undefined, preset: 'thisMonth' });
    expect(screen.getByRole('button', { name: 'From date' })).toBeInTheDocument();
  });

  it('puts the screen’s other scope controls after the dates', () => {
    /* Prevents: the statement's "Show corrections" switch moving off the
       right-hand cluster when the bar became a component. */
    renderPicker({ preset: 'custom', end: <button type="button">Show corrections</button> });
    const to = screen.getByRole('button', { name: 'To date' });
    const extra = screen.getByRole('button', { name: 'Show corrections' });
    expect(to.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
