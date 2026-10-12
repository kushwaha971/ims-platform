import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbDisclosure } from 'src/design-system';

/**
 * QA B25 — "More details" on Add book drew an empty bordered strip under its header
 * while closed: with `keepMounted` the closed panel is `hidden="until-found"` on
 * Chrome, which hides the content but keeps the box, padding and top rule included.
 * The box takes its padding and rule only while open.
 */
describe('UbDisclosure', () => {
  it('gives a closed, kept-mounted panel no padding or rule of its own', async () => {
    render(
      <UbDisclosure label="More details" keepMounted>
        <span>Publisher</span>
      </UbDisclosure>
    );
    const panel = screen.getByRole('region', { hidden: true });
    expect(panel.className).not.toMatch(/\b(py-4|border-t)\b/);
    await userEvent.click(screen.getByRole('button', { name: 'More details' }));
    expect(panel.className).toMatch(/\bpy-4\b/);
    expect(panel).toBeVisible();
  });
});
