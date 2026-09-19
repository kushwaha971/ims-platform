import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbStepper } from './UbStepper';

/**
 * CR-2026-09-19-F — `UbStepper`'s contract, now that it is the onboarding
 * rail's step list and the phone's progress bar rather than one block that
 * renders both in one place.
 *
 * Everything here is a defect that the wizard's review turned up, or an
 * accessibility promise the rail makes:
 *
 *   · the list is a real ordered list and the step you are on carries
 *     `aria-current="step"` — the only way the order survives without the
 *     visual;
 *   · the bar has a name AND a value, so "how far am I" is answerable without
 *     the numbers being read off the screen;
 *   · the bar names the step, not just the count;
 *   · the two forms can be rendered separately, because in the rail layout they
 *     are in two different places in the DOM;
 *   · the breakpoint is `lg`, not `md` — the rail only fits from 1024 px.
 */
const STEPS = [
  { key: 'business', label: 'Tell us about your business' },
  { key: 'gst', label: 'GST details' },
  { key: 'address', label: 'Address' },
  { key: 'summary', label: 'Almost done' },
];

const setup = (props: Partial<React.ComponentProps<typeof UbStepper>> = {}) =>
  render(
    <UbStepper steps={STEPS} current={2} completed={1} progressLabel="Step 2 of 4" {...props} />
  );

describe('UbStepper — the step semantics', () => {
  it('is an ordered list with one item per step, in order', () => {
    setup();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');

    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Tell us about your business');
    expect(items[3]).toHaveTextContent('Almost done');
  });

  it('marks the step you are on with aria-current="step", and only that one', () => {
    setup();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    const current = items.filter((item) => item.getAttribute('aria-current') === 'step');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('GST details');
  });

  it('makes a completed step navigable and a future step inert (FR-9)', async () => {
    const user = userEvent.setup();
    const onStepSelect = jest.fn();
    setup({ onStepSelect });

    // Step 1 is done, so it is a control …
    const back = screen.getByRole('button', { name: /Tell us about your business/ });
    await user.click(back);
    expect(onStepSelect).toHaveBeenCalledWith(1);

    // … step 3 is not reached, so it is text, not a control the user can tap
    // and be ignored by.
    expect(screen.queryByRole('button', { name: /Address/ })).not.toBeInTheDocument();
    // Nor is the step you are already on.
    expect(screen.queryByRole('button', { name: /GST details/ })).not.toBeInTheDocument();
  });

  it('keeps every row at the 44 px target (R-A-3)', () => {
    setup({ onStepSelect: jest.fn() });
    const rows = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((item) => item.firstElementChild);

    for (const row of rows) expect(row?.getAttribute('class')).toContain('min-h-11');
  });
});

describe('UbStepper — the progress bar', () => {
  it('has both an accessible name and a value', () => {
    setup();
    const bar = screen.getByRole('progressbar');

    expect(bar).toHaveAccessibleName('Step 2 of 4 — GST details');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('says WHICH step, not only how many — the count alone locates nothing', () => {
    setup();
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    // The step's own sentence label, beside the count.
    expect(screen.getAllByText('GST details').length).toBeGreaterThan(0);
  });

  it('clamps a step number outside the list rather than naming nothing', () => {
    setup({ current: 9 });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar')).toHaveAccessibleName(/Almost done/);
  });
});

describe('UbStepper — the two forms, and where they switch', () => {
  it('hides the list below lg and the bar from lg up when it renders both', () => {
    const { container } = setup();

    expect(screen.getByRole('list').getAttribute('class')).toContain('hidden lg:flex');
    const bar = container.querySelector('[role="progressbar"]')?.parentElement;
    expect(bar?.getAttribute('class')).toContain('lg:hidden');
  });

  it('renders the list alone for the rail — a bar inside a rail is not a rail', () => {
    setup({ show: 'list' });

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    // And it is not breakpoint-hidden: the rail itself is what `lg` gates.
    expect(screen.getByRole('list').getAttribute('class')).not.toContain('hidden');
  });

  it('renders the bar alone for the phone, above the form', () => {
    setup({ show: 'bar' });

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('UbStepper — the dark rail tone', () => {
  it('paints its text from the on-nav tokens, which are dark-safe in both themes', () => {
    setup({ show: 'list', tone: 'onNav' });
    const items = within(screen.getByRole('list')).getAllByRole('listitem');

    expect(items[2]?.innerHTML).toContain('text-text-onNavMuted');
    expect(items[1]?.innerHTML).toContain('text-text-onNav');
    // Never --text-primary, which is near-black and unreadable on --surface-nav.
    expect(screen.getByRole('list').innerHTML).not.toContain('text-text-primary');
  });
});
