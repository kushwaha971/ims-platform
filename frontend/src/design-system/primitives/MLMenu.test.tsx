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
});
