import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MLMenu, MLMenuItem, placeMenu } from './mlOverlayPrimitives';

/**
 * docs/platform/14 R7 — the menu panel was `absolute` inside its trigger's
 * wrapper. In the 180 px sidebar rail it was clipped and made the rail scroll;
 * on a 390 px phone it ran off the right edge from a trigger in the top bar.
 * It is portalled and placed from the trigger's box now, and these hold the
 * placement rules a browser QA pass found broken.
 */
describe('placeMenu', () => {
  const phone = { width: 390, height: 844 };
  const laptop = { width: 1280, height: 800 };

  it('opens under the trigger at full width on a laptop rail', () => {
    expect(placeMenu({ left: 0, right: 180, bottom: 56 }, laptop, 'start')).toEqual({
      top: 60,
      left: 16,
      width: 320,
      maxHeight: 724,
    });
  });

  it('slides back inside a phone from a trigger in the middle of the top bar', () => {
    const place = placeMenu({ left: 104, right: 274, bottom: 50 }, phone, 'start');
    expect(place.width).toBe(320);
    expect(place.left + place.width).toBeLessThanOrEqual(phone.width - 16);
    expect(place.left).toBeGreaterThanOrEqual(16);
  });

  it('never wider than the screen minus its gutters', () => {
    expect(
      placeMenu({ left: 0, right: 40, bottom: 40 }, { width: 300, height: 600 }, 'end').width
    ).toBe(268);
  });

  it('scrolls inside itself rather than below the fold', () => {
    expect(placeMenu({ left: 0, right: 100, bottom: 700 }, laptop, 'start').maxHeight).toBe(160);
  });
});

describe('MLMenu', () => {
  /** B24: async commands need a cancellable selection so their progress row remains visible. */
  it('keeps a menu open when the item cancels default closing', async () => {
    render(
      <MLMenu trigger="Open" ariaLabel="Things">
        <MLMenuItem onSelect={(event) => event?.preventDefault()}>Add app</MLMenuItem>
      </MLMenu>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add app' }));
    expect(screen.getByRole('menu')).toBeVisible();
  });

  /** A completed async command must let its owner close the controlled menu. */
  it('accepts a controlled open state for completion', () => {
    const { rerender } = render(
      <MLMenu trigger="Open" ariaLabel="Things" open onOpenChange={() => undefined}>
        <MLMenuItem onSelect={() => undefined}>Add app</MLMenuItem>
      </MLMenu>
    );
    expect(screen.getByRole('menu')).toBeVisible();
    rerender(
      <MLMenu trigger="Open" ariaLabel="Things" open={false} onOpenChange={() => undefined}>
        <MLMenuItem onSelect={() => undefined}>Add app</MLMenuItem>
      </MLMenu>
    );
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('renders its panel outside the trigger’s container', async () => {
    render(
      <div data-testid="rail" style={{ overflow: 'auto' }}>
        <MLMenu trigger="Open" ariaLabel="Things">
          <MLMenuItem onSelect={() => undefined}>One</MLMenuItem>
        </MLMenu>
      </div>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const menu = screen.getByRole('menu');
    expect(screen.getByTestId('rail').contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
  });

  it('closes when an item is chosen, and runs the item', async () => {
    /* Owner, 12 Oct 2026: the apps menu stayed open over the app it had just
       switched to. A menu is a list of commands; choosing one ends it. */
    const chosen = jest.fn();
    render(
      <MLMenu trigger="Open" ariaLabel="Things">
        <MLMenuItem onSelect={chosen}>One</MLMenuItem>
      </MLMenu>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'One' }));
    expect(chosen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-expanded', 'false');
  });
});
