import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { isUbTagColor, UbTag } from './UbTag';
import { UbTagList } from './UbTagList';

/**
 * A tag chip carries a MERCHANT's word, in a colour that means whatever they
 * decided it means. Everything worth asserting here follows from that: the name
 * is never optional, the colour never replaces it, and nothing about the chip
 * re-cases or re-words what they typed.
 */
describe('UbTag', () => {
  it('shows the name whatever the colour is', () => {
    /**
     * R-A-2. The colour is recognition, not information — a merchant with
     * deuteranopia has to read the same chip as everybody else. A chip that
     * rendered a swatch alone at some size would be a label nobody can read.
     */
    render(<UbTag name="Camp Area" color="viz-1" />);

    expect(screen.getByText('Camp Area')).toBeInTheDocument();
  });

  it('does not re-case a name the merchant typed', () => {
    /**
     * `ds-label` is sentence case and must never be `ds-label-caps` here. Tag
     * names are USER CONTENT: "GST" is not "Gst", and a merchant who wrote
     * "iPhone dealers" did not ask for "IPHONE DEALERS". The badge tier this
     * chip sits next to on the same row IS uppercased, which is exactly why
     * this is worth an assertion rather than a comment.
     */
    render(<UbTag name="GST wale" color={null} />);

    const chip = screen.getByText('GST wale');
    expect(chip.textContent).toBe('GST wale');
    expect(chip.className).not.toContain('uppercase');
  });

  it('gives the remove button a name that says which tag', () => {
    /**
     * Five chips on one party means five remove buttons, and "Remove" five
     * times is a list of identical controls that a screen-reader user has to
     * count positions in. FRD §5 asks for "Remove tag {name}".
     */
    render(<UbTag name="Route 2" onRemove={jest.fn()} removeLabel="Remove tag Route 2" />);

    expect(screen.getByRole('button', { name: 'Remove tag Route 2' })).toBeInTheDocument();
  });

  it('has no remove button when it is not removable', () => {
    /** A chip on a list row is a label, not a control — a stray tap must not
     *  take a tag off a party the merchant was only scrolling past. */
    render(<UbTag name="Camp Area" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('carries the full name for a pointer even when it truncates', () => {
    /** The chip caps at 120px (FRD §7) so a long tag cannot push the party
     *  name off the row, which means the visible text is not always the whole
     *  answer. */
    render(<UbTag name="Camp Area East Sector Two" />);

    expect(screen.getByTitle('Camp Area East Sector Two')).toBeInTheDocument();
  });
});

describe('isUbTagColor', () => {
  it('accepts the palette and refuses everything else', () => {
    /**
     * The guard exists because the server's palette and this client's are two
     * statements about the same eight tokens, deployed separately. A hex left
     * over from before migration 0007, or a ninth token from a newer server,
     * would otherwise reach Tailwind as a class that does not exist — and an
     * unknown class renders a chip with no border at all, which reads as a bug
     * in the chip rather than a mismatch in the palette.
     */
    expect(isUbTagColor('viz-1')).toBe(true);
    expect(isUbTagColor('viz-8')).toBe(true);
    expect(isUbTagColor('viz-9')).toBe(false);
    expect(isUbTagColor('#2563EB')).toBe(false);
    expect(isUbTagColor(null)).toBe(false);
    expect(isUbTagColor(undefined)).toBe(false);
  });
});

const tag = (id: string, name: string) => ({ id, name, color: null });

describe('UbTagList', () => {
  it('names the list after what it belongs to', () => {
    /**
     * R-A-1. Twenty-five rows each holding a list called "Tags" announces as
     * twenty-five identical lists, and the one thing a screen-reader user needs
     * to know — whose tags these are — is the one thing missing.
     */
    render(<UbTagList tags={[tag('1', 'Camp Area')]} label="Tags on Ramesh Traders" />);

    const list = screen.getByRole('list', { name: 'Tags on Ramesh Traders' });
    expect(within(list).getByText('Camp Area')).toBeInTheDocument();
  });

  it('counts the ones it cannot show rather than dropping them', () => {
    /**
     * A row is a place to decide. Past `max` the remainder becomes "+2", which
     * answers the only question a scanning merchant has about tags they cannot
     * see — are there any — and the `title` names them for a pointer so the
     * answer costs no width.
     */
    render(
      <UbTagList
        tags={[tag('1', 'Camp'), tag('2', 'Deccan'), tag('3', 'Route 2'), tag('4', 'Wholesale')]}
        label="Tags"
        max={2}
        overflowLabel={(count) => `+${count}`}
      />
    );

    expect(screen.getByText('Camp')).toBeInTheDocument();
    expect(screen.getByText('Deccan')).toBeInTheDocument();
    expect(screen.queryByText('Route 2')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByTitle('Route 2, Wholesale')).toBeInTheDocument();
  });

  it('renders nothing at all for an untagged row unless the lane is reserved', () => {
    /**
     * The two halves of FRD §5's fixed lane. A book that does not use tags must
     * pay nothing for them — no empty list element, no reserved height, rows
     * exactly as tall as before the feature existed. A book that DOES use them
     * gets the lane on every row, so the list is a uniform height rather than
     * stepping up and down past the tagged ones.
     */
    const { container, rerender } = render(<UbTagList tags={[]} label="Tags" />);
    expect(container.querySelector('ul')).toBeNull();

    rerender(<UbTagList tags={[]} label="Tags" reserveSpace />);
    expect(screen.getByRole('list', { name: 'Tags' })).toBeInTheDocument();
  });

  it('the overflow counter is not a chip', async () => {
    /**
     * "+2" looks like a chip and is not one: it cannot be removed, filtered or
     * opened. Rendering it in the same visual language as the truth beside it
     * would teach a merchant that a chip is sometimes a lie.
     */
    const user = userEvent.setup();
    render(
      <UbTagList
        tags={[tag('1', 'Camp'), tag('2', 'Deccan')]}
        label="Tags"
        max={1}
        overflowLabel={(count) => `+${count}`}
      />
    );

    await user.click(screen.getByText('+1'));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
