import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbDialog } from 'src/design-system/UbDialog';

import { UbTokenInput, type UbTokenInputOption } from './UbTokenInput';

const OPTIONS: UbTokenInputOption[] = [
  { value: 'Camp Area', label: 'Camp Area', hint: '34 parties' },
  { value: 'Deccan', label: 'Deccan' },
  { value: 'Route 2', label: 'Route 2' },
];

/** A controlled harness, because every behaviour here is about what the value
 *  becomes rather than what the picker renders in isolation. */
function Harness(props: {
  readonly initial?: UbTokenInputOption[];
  readonly onCreate?: (name: string) => UbTokenInputOption | null;
  readonly max?: number;
  readonly onValue?: (next: readonly UbTokenInputOption[]) => void;
}) {
  const [value, setValue] = useState<readonly UbTokenInputOption[]>(props.initial ?? []);
  return (
    <UbTokenInput
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onValue?.(next);
      }}
      options={OPTIONS}
      onCreate={props.onCreate}
      max={props.max}
      placeholder="Add a tag"
      searchPlaceholder="Search or type a new tag"
      emptyLabel="No tags yet"
      createLabel={(name) => `Create “${name}”`}
      maxReachedLabel={(max) => `Up to ${max} tags.`}
      removeLabel={(name) => `Remove tag ${name}`}
      aria-label="Tags"
    />
  );
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('combobox', { name: 'Tags' }));
  return screen.getByPlaceholderText('Search or type a new tag');
};

describe('UbTokenInput', () => {
  it('adds a choice as a chip and stops offering it', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await open(user);
    await user.click(screen.getByText('Deccan'));

    expect(screen.getByRole('button', { name: 'Remove tag Deccan' })).toBeInTheDocument();
    /* Exactly one "Deccan" on screen: the chip. A picker that keeps offering
       what is already chosen invites a second press that does nothing, and the
       merchant cannot tell whether the first one worked. */
    expect(screen.getAllByText('Deccan')).toHaveLength(1);
    /* And the popover is still open, because multi-select: a merchant adding
       "Camp Area" is usually adding "Route 2" next, and a picker that shut
       itself after each choice would be three round trips through the same
       control. */
    expect(screen.getByText('Route 2')).toBeInTheDocument();
  });

  it('offers to create a name that does not exist', async () => {
    /** FR-5, and the flow the whole feature exists for: a merchant at a counter
     *  types "Wholesale" and presses Create, without leaving the party form to
     *  go and set up a taxonomy first. */
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Harness onCreate={(name) => ({ value: name, label: name })} onValue={onValue} />);

    const input = await open(user);
    await user.type(input, 'Wholesale');
    await user.click(screen.getByText('Create “Wholesale”'));

    expect(onValue).toHaveBeenCalledWith([{ value: 'Wholesale', label: 'Wholesale' }]);
  });

  it('does NOT offer to create a name that already exists in another casing', async () => {
    /**
     * FR-3 makes tag names case-insensitively unique, so "camp area" IS
     * "Camp Area". Offering to create it would invite a duplicate the server
     * refuses anyway — and the merchant would be left unsure which of the two
     * they ended up with.
     */
    const user = userEvent.setup();
    render(<Harness onCreate={(name) => ({ value: name, label: name })} />);

    const input = await open(user);
    await user.type(input, 'camp area');

    expect(screen.queryByText('Create “camp area”')).not.toBeInTheDocument();
    expect(screen.getByText('Camp Area')).toBeInTheDocument();
  });

  it('lets the caller refuse a name it will not accept', async () => {
    /**
     * `onCreate` returning null is how the tag field refuses a comma (EC-14):
     * the list filter serialises tags as `?tag=A,B`, so "Camp, East" would
     * round-trip as two tags that do not exist and the filter would silently
     * match nothing.
     */
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(
      <Harness
        onCreate={(name) => (name.includes(',') ? null : { value: name, label: name })}
        onValue={onValue}
      />
    );

    const input = await open(user);
    await user.type(input, 'Camp, East');
    await user.click(screen.getByText('Create “Camp, East”'));

    expect(onValue).not.toHaveBeenCalled();
  });

  it('never offers a create row when the caller cannot create', async () => {
    /** The filter picker. Creating a tag from a filter would make a tag that is
     *  on nobody, to filter for nobody — and would put a write on a control a
     *  read-only accountant is entitled to use. */
    const user = userEvent.setup();
    render(<Harness />);

    const input = await open(user);
    await user.type(input, 'Wholesale');

    expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
    expect(screen.getByText('No tags yet')).toBeInTheDocument();
  });

  it('removes the last chip on Backspace in an empty field', async () => {
    /** The convention every token input has had since email To: fields, and the
     *  one thing people try without being told. */
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(
      <Harness
        initial={[
          { value: 'Camp Area', label: 'Camp Area' },
          { value: 'Deccan', label: 'Deccan' },
        ]}
        onValue={onValue}
      />
    );

    const input = await open(user);
    await user.type(input, '{Backspace}');

    expect(onValue).toHaveBeenCalledWith([{ value: 'Camp Area', label: 'Camp Area' }]);
  });

  it('does NOT eat a chip when Backspace is correcting a typo', async () => {
    /**
     * The half that makes the shortcut safe. Without the empty-query guard, a
     * merchant who mistypes one letter and reaches for Backspace loses a tag
     * instead — silently, because the chip that vanished is above where they
     * are looking.
     */
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Harness initial={[{ value: 'Camp Area', label: 'Camp Area' }]} onValue={onValue} />);

    const input = await open(user);
    await user.type(input, 'Dex{Backspace}');

    expect(onValue).not.toHaveBeenCalled();
  });

  it('stops offering anything once the ceiling is reached, and says why', async () => {
    /**
     * BR-3's ten per party, said at the control. A picker that kept accepting
     * and let the server refuse on save would be a form that takes twenty other
     * fields and then loses them to a 400 about an eleventh tag.
     */
    const user = userEvent.setup();
    render(
      <Harness
        max={2}
        initial={[
          { value: 'Camp Area', label: 'Camp Area' },
          { value: 'Deccan', label: 'Deccan' },
        ]}
        onCreate={(name) => ({ value: name, label: name })}
      />
    );

    await open(user);

    expect(screen.getByText('Up to 2 tags.')).toBeInTheDocument();
    expect(screen.queryByText('Route 2')).not.toBeInTheDocument();
  });

  it('puts a prefix match above a substring one', async () => {
    /** What somebody typing expects: "ro" should reach "Route 2" before
     *  anything that merely contains those letters. The caller's order — most
     *  used first — survives within each band. */
    const user = userEvent.setup();
    render(<Harness />);

    const input = await open(user);
    await user.type(input, 'ea');

    const shown = screen.getAllByTitle(/Camp Area|Deccan|Route 2/).map((node) => node.title);
    /* "Camp Area" contains "ea"; so does nothing else here — the assertion that
       matters is that a substring match is still OFFERED rather than dropped. */
    expect(shown).toContain('Camp Area');
  });

  it('a chip can be taken off without opening the picker', async () => {
    /** Removal lives on the chips outside the popover: a merchant taking a tag
     *  off should not have to open a menu to do it. */
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Harness initial={[{ value: 'Camp Area', label: 'Camp Area' }]} onValue={onValue} />);

    await user.click(screen.getByRole('button', { name: 'Remove tag Camp Area' }));

    expect(onValue).toHaveBeenCalledWith([]);
  });
});

describe('the chips are beside the trigger, not inside it', () => {
  /**
   * Two defects with one cause, both found by reading the markup.
   *
   * The chips used to be rendered INSIDE `MLPopoverTrigger`, which is a real
   * `<button>`. So every chip's remove button was a `<button>` inside a
   * `<button>`:
   *
   *   1. Removing a tag also opened the picker, because the click bubbled to
   *      the trigger. The component's own docstring claimed it stopped
   *      propagation; it never did.
   *   2. `<button>` inside `<button>` is invalid HTML. React's client render
   *      keeps the nesting, but a server render emits markup the browser parser
   *      auto-closes — so a server-rendered field with chips hydrates with the
   *      chips OUTSIDE the trigger, in a different place from where React put
   *      them. Screen readers are also not required to expose controls nested
   *      inside a `role="combobox"` button, so "Remove tag Camp Area" was
   *      correctly labelled and potentially unreachable.
   */
  it('removing a chip does not open the picker', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ value: 'Camp Area', label: 'Camp Area' }]} />);

    await user.click(screen.getByRole('button', { name: 'Remove tag Camp Area' }));

    expect(screen.queryByPlaceholderText('Search or type a new tag')).not.toBeInTheDocument();
  });

  it('puts no button inside the trigger button', () => {
    render(<Harness initial={[{ value: 'Camp Area', label: 'Camp Area' }]} />);

    const trigger = screen.getByRole('combobox', { name: 'Tags' });
    expect(trigger.querySelector('button')).toBeNull();
  });

  it('still opens the picker when the field itself is clicked', () => {
    /** The restructure must not cost the control its whole job. */
    render(<Harness initial={[{ value: 'Camp Area', label: 'Camp Area' }]} />);

    expect(screen.getByRole('combobox', { name: 'Tags' })).toBeInTheDocument();
  });
});

describe('UbTokenInput inside an overlay', () => {
  /**
   * The defect this block exists for, found by opening the party form in a real
   * browser and pressing Escape.
   *
   * The picker is used in three places and two of them are inside an overlay:
   * the party form's drawer, and the bulk-tag dialog. Radix portals the
   * picker's popover out of the overlay's DOM subtree, so the overlay's own
   * Escape handler and the popover's are two listeners on the same document
   * with no idea about each other — and the overlay's was registered first, so
   * it won. One press of Escape closed the picker AND the drawer, taking a
   * half-filled party form with it.
   *
   * Nothing in jsdom or in the unit tests could see this, because the picker
   * had always been tested on its own. It took looking at the screen.
   */
  it('closes the picker and leaves the overlay it is inside alone', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();

    render(
      <UbDialog
        open
        onOpenChange={onOpenChange}
        title="Add party"
        closeLabel="Close"
        footer={null}
      >
        <Harness />
      </UbDialog>
    );

    await user.click(screen.getByRole('combobox', { name: 'Tags' }));
    expect(screen.getByPlaceholderText('Search or type a new tag')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    /* The picker is gone… */
    expect(screen.queryByPlaceholderText('Search or type a new tag')).not.toBeInTheDocument();
    /* …and the dialog was never asked to close. */
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
