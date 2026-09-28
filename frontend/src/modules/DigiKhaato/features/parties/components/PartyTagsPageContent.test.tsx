import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { resetPartyTags } from '../redux/partyTagSlice';

import { createPartyTagColumns } from './PartyTagsColumns';
import { PartyTagsPageContent } from './PartyTagsPageContent';

/**
 * PTY-05 FR-7 — the tag manager, end to end inside the client, with the service
 * stubbed at the module boundary (§19.13.3).
 *
 * The assertions worth reading twice are about the two destructive actions.
 * Delete and merge are the only things in PTY-05 that cannot be undone, and
 * both of them are dangerous in the same specific way: they are safe operations
 * that merchants believe are unsafe ("will deleting this tag delete the
 * people?"). So the copy is load-bearing, and so is where its numbers come
 * from.
 */
jest.mock('../api/tagService');

const tagService = jest.requireMock('../api/tagService') as {
  listTags: jest.Mock;
  createTag: jest.Mock;
  updateTag: jest.Mock;
  deleteTag: jest.Mock;
  countTagParties: jest.Mock;
  mergeTags: jest.Mock;
};

const CAMP = { id: 'tag-1', name: 'Camp Area', color: 'viz-1', partyCount: 34 };
const DECCAN = { id: 'tag-2', name: 'Deccan', color: null, partyCount: 0 };

const signIn = (permissions: readonly PermissionCode[]): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@shop.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: [],
      version: 1,
    })
  );
};

describe('PartyTagsPageContent', () => {
  beforeEach(() => {
    store.dispatch(resetPartyTags());
    jest.clearAllMocks();
    tagService.listTags.mockResolvedValue([CAMP, DECCAN]);
    tagService.countTagParties.mockResolvedValue(34);
    signIn(['parties.party.read', 'parties.party.write', 'parties.party.delete']);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  });

  it('lists the tags with what each one holds', async () => {
    renderWithProviders(<PartyTagsPageContent />);

    expect(await screen.findByText('Camp Area')).toBeInTheDocument();
    expect(screen.getByText('34 parties')).toBeInTheDocument();
  });

  it('words an unused tag rather than printing a nought', async () => {
    /**
     * "0 parties" is a number a reader has to translate. "Not used yet" is the
     * fact, and on this screen it is the fact that matters: an unused tag is
     * the one to merge or delete when the two-hundred ceiling is in sight
     * (FR-13).
     */
    renderWithProviders(<PartyTagsPageContent />);

    expect(await screen.findByText('Not used yet')).toBeInTheDocument();
  });

  it('makes the count a way in to the parties it counts', async () => {
    /**
     * A statistic becomes a route. The link is NAMED for a screen reader,
     * because "34 parties" repeated down a column is a set of links called
     * nothing, and it filters by NAME because that is what the party list's
     * `tag` parameter takes and what a person reading the URL can check.
     */
    renderWithProviders(<PartyTagsPageContent />);

    const link = await screen.findByRole('link', {
      name: 'Show the 34 parties tagged Camp Area',
    });
    expect(link).toHaveAttribute('href', '/parties?tag=Camp%20Area');
  });

  it('asks the server how many parties a delete will touch, not the row', async () => {
    /**
     * The row carries `partyCount` from whenever the list loaded, and the
     * confirmation's sentence is about what is ABOUT TO HAPPEN. Somebody in the
     * next room tagging parties while this dialog is open is not a
     * hypothetical in a shared book — so the dialog asks, with `?dry_run=true`,
     * down the same code path the delete itself will take.
     *
     * The stub deliberately disagrees with the row (34 on the row, 36 from the
     * server) so that a dialog reading the cached number cannot pass this.
     */
    tagService.countTagParties.mockResolvedValue(36);
    const user = userEvent.setup();
    renderWithProviders(<PartyTagsPageContent />);
    await screen.findByText('Camp Area');

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0] as HTMLElement);

    expect(tagService.countTagParties).toHaveBeenCalledWith(CAMP.id);
    expect(
      await screen.findByText(
        'It will be taken off 36 parties. Every one of them stays, with their other tags.'
      )
    ).toBeInTheDocument();
  });

  it('says what SURVIVES a delete, because that is what merchants fear', async () => {
    /**
     * BR-5. The copy states what is kept rather than what is removed, and that
     * is the whole reason the sentence is worded the way it is: merchants
     * genuinely believe deleting a label deletes the people.
     */
    const user = userEvent.setup();
    renderWithProviders(<PartyTagsPageContent />);
    await screen.findByText('Camp Area');

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0] as HTMLElement);

    expect(await screen.findByText(/Every one of them stays/)).toBeInTheDocument();
  });

  it('turns a rename collision into an offer to merge', async () => {
    /**
     * The server answers 409 `tag_name_taken` with `details.existing_tag_id`
     * precisely so the client can do this. The merchant has just found out the
     * two are the same thing under different casing; telling them "that name is
     * taken" and stopping leaves them to work out the rest.
     */
    tagService.updateTag.mockRejectedValue({
      code: 'tag_name_taken',
      message: 'A tag called "Deccan" already exists.',
      details: { existing_tag_id: DECCAN.id },
      requestId: 'req_abc123',
      status: 409,
      warnings: [],
    });
    const user = userEvent.setup();
    renderWithProviders(<PartyTagsPageContent />);
    await screen.findByText('Camp Area');

    await user.click(screen.getAllByRole('button', { name: 'Rename' })[0] as HTMLElement);
    const name = await screen.findByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Deccan');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('“Deccan” already exists. Merge them instead?')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument();
  });

  it('states the arithmetic before a merge runs', async () => {
    /**
     * A merge is one-directional and deletes its source (BR-6). "Merge Camp
     * into Camp Area?" gives a merchant nothing to check their intent against;
     * the number of parties that move and the name of the tag that stops
     * existing do.
     */
    const user = userEvent.setup();
    renderWithProviders(<PartyTagsPageContent />);
    await screen.findByText('Camp Area');

    await user.click(screen.getAllByRole('button', { name: 'Merge into…' })[0] as HTMLElement);
    await user.click(await screen.findByRole('combobox', { name: 'Keep this tag' }));
    /* By ROLE, not by text: "Deccan" is also the name of a chip in the row
       behind the dialog, and a text query would find whichever the DOM happened
       to put first. */
    await user.click(await screen.findByRole('option', { name: 'Deccan' }));

    expect(
      await screen.findByText('34 parties will move to “Deccan”. “Camp Area” will be deleted.')
    ).toBeInTheDocument();
  });

  it('never offers a tag as a target for merging into itself', async () => {
    /** The server refuses it, so offering it would be a choice whose only
     *  possible outcome is an error message. */
    const user = userEvent.setup();
    renderWithProviders(<PartyTagsPageContent />);
    await screen.findByText('Camp Area');

    await user.click(screen.getAllByRole('button', { name: 'Merge into…' })[0] as HTMLElement);
    await user.click(await screen.findByRole('combobox', { name: 'Keep this tag' }));

    expect(await screen.findByRole('option', { name: 'Deccan' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Camp Area' })).not.toBeInTheDocument();
  });

  it('shows a read-only role the tags and none of the actions', async () => {
    /**
     * §19.7.5 — hidden, not disabled. The manager is genuinely useful read-only:
     * the counts are the fastest way to see which tag holds which part of the
     * book. What must not appear are three buttons that would each 403.
     */
    signIn(['parties.party.read']);
    renderWithProviders(<PartyTagsPageContent />);

    expect(await screen.findByText('Camp Area')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New tag' })).not.toBeInTheDocument();
  });

  it('lets staff rename but not delete', async () => {
    /**
     * §12 — tags introduce no new codenames. Assigning and creating is the party
     * WRITE right, because a staff member at the counter needs it to finish a
     * form; deleting one changes what everybody in the business sees, so it is
     * the party DELETE right.
     */
    signIn(['parties.party.read', 'parties.party.write']);
    renderWithProviders(<PartyTagsPageContent />);
    await screen.findByText('Camp Area');

    expect(screen.getAllByRole('button', { name: 'Rename' })).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('says how much of the ceiling is used before it is reached', async () => {
    /** FR-13. The refusal at 201 should be the end of a sentence the merchant
     *  has been reading, not a surprise. */
    renderWithProviders(<PartyTagsPageContent />);

    expect(await screen.findByText('2 of 200 tags used')).toBeInTheDocument();
  });

  it('stops offering New tag at the ceiling, and says why', async () => {
    /**
     * The one place this screen disables rather than hides a control, and the
     * exception is principled: the reason is stated in the banner directly
     * above the button, and the fix — merge or delete one — is the screen the
     * button is on.
     */
    tagService.listTags.mockResolvedValue(
      Array.from({ length: 200 }, (_value, index) => ({
        id: `t${index}`,
        name: `Tag ${index}`,
        color: null,
        partyCount: 0,
      }))
    );
    renderWithProviders(<PartyTagsPageContent />);

    expect(
      await screen.findByText('You have reached 200 tags. Merge or delete one to add another.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New tag' })).toBeDisabled();
  });

  it('searches without going back to the server', async () => {
    /**
     * The whole set is already in the store — the endpoint is unpaginated
     * because FR-13 caps a tenant at two hundred, and four other screens need
     * it there anyway. Asking the server to slice rows it has already sent
     * would be a round trip to learn something this page is holding.
     */
    const user = userEvent.setup();
    renderWithProviders(<PartyTagsPageContent />);
    await screen.findByText('Camp Area');
    const before = tagService.listTags.mock.calls.length;

    await user.type(screen.getByRole('textbox', { name: 'Search tags' }), 'dec');

    await waitFor(() => {
      expect(screen.queryByText('Camp Area')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Deccan')).toBeInTheDocument();
    expect(tagService.listTags).toHaveBeenCalledTimes(before);
  });

  it('shows the colour swatches by NAME, never by colour alone', async () => {
    /**
     * R-A-2 and FRD §5. A row of eight coloured circles cannot be used by
     * somebody who cannot tell them apart, and "the third one" is not something
     * a screen reader says.
     */
    const user = userEvent.setup();
    renderWithProviders(<PartyTagsPageContent />);
    await screen.findByText('Camp Area');

    await user.click(screen.getByRole('button', { name: 'New tag' }));

    const colours = await screen.findByRole('radiogroup', { name: 'Colour' });
    expect(within(colours).getByRole('radio', { name: 'Blue' })).toBeInTheDocument();
    expect(within(colours).getByRole('radio', { name: 'Teal' })).toBeInTheDocument();
    expect(within(colours).getByRole('radio', { name: 'No colour' })).toBeInTheDocument();
  });

  it('refuses a comma while it is being typed, not after a round trip', async () => {
    /**
     * EC-14. The list filter serialises tags as `?tag=Camp Area,Route 2`, so
     * "Camp, East" would round-trip as two tags that do not exist and the
     * merchant would see a filter matching nothing with no clue why.
     */
    const user = userEvent.setup();
    renderWithProviders(<PartyTagsPageContent />);
    await screen.findByText('Camp Area');

    await user.click(screen.getByRole('button', { name: 'New tag' }));
    await user.type(await screen.findByRole('textbox', { name: 'Name' }), 'Camp, East');

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(tagService.createTag).not.toHaveBeenCalled();
  });
});

describe('the manager at a width where the actions barely fit', () => {
  /**
   * A regression guard for a defect a screenshot found and no test could.
   *
   * At the md tier the actions column was 30% of a ~720 px table — about 216 px
   * for three text buttons needing roughly 260. The table does not wrap and the
   * cell truncates, so "Rename" rendered as the single letter "e". Every
   * assertion in this file still passed, because `getByRole('button', { name:
   * 'Rename' })` reads the ACCESSIBLE name, which is the full string whatever
   * the pixels do.
   *
   * So this asserts the two things that make clipping impossible rather than
   * unlikely: the shares leave the actions the most room, and the buttons
   * refuse to break a word.
   */
  it('gives the actions more of the table than either other column', () => {
    const columns = createPartyTagColumns({
      t: ((key: string) => key) as never,
      canWrite: true,
      canDelete: true,
      onEdit: jest.fn(),
      onMerge: jest.fn(),
      onDelete: jest.fn(),
    });

    const share = (id: string) => columns.find((column) => column.id === id)?.widthShare ?? 0;

    expect(share('actions')).toBeGreaterThan(share('name'));
    expect(share('actions')).toBeGreaterThan(share('partyCount'));
    /* And they still sum to 100, which is what `table-fixed` needs in order to
       scale them down to the space a checkbox column leaves. */
    expect(share('name') + share('partyCount') + share('actions')).toBe(100);
  });

  it('never breaks an action label across lines', async () => {
    renderWithProviders(<PartyTagsPageContent />);
    await screen.findByText('Camp Area');

    for (const label of ['Rename', 'Merge into…', 'Delete']) {
      const button = screen.getAllByRole('button', { name: label })[0] as HTMLElement;
      expect(button.className).toContain('whitespace-nowrap');
    }
  });
});
