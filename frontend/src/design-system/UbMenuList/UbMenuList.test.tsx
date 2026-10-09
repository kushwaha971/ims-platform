import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbMenuList } from 'src/design-system/UbMenuList';

/**
 * `UbMenuList` — the rows of the More tab and of every labelled ⋯ sheet. One
 * component so a row is the same thing wherever a merchant meets it.
 */
describe('UbMenuList', () => {
  it('renders destinations as links and actions as buttons, under a heading', async () => {
    /* Prevents: a "row" that looks tappable and is neither a link nor a button. */
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(
      <UbMenuList
        title="Money"
        rows={[
          { key: 'pay', label: 'Payments', href: '/payments' },
          { key: 'out', label: 'Sign out', onSelect, tone: 'danger' },
          { key: 'who', label: 'Suresh Kumar' },
        ]}
      />
    );
    expect(screen.getByRole('region', { name: 'Money' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Payments' })).toHaveAttribute('href', '/payments');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Suresh Kumar' })).not.toBeInTheDocument();
  });

  it('is a radiogroup when it offers one choice among its rows', () => {
    /* Prevents: a language list a screen reader hears as unrelated buttons. */
    render(
      <UbMenuList
        title="Language"
        selectable
        rows={[
          { key: 'en', label: 'English', selected: true, onSelect: jest.fn() },
          { key: 'hi', label: 'हिन्दी', lang: 'hi', onSelect: jest.fn() },
        ]}
      />
    );
    expect(screen.getByRole('radiogroup', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'हिन्दी' })).toHaveAttribute('aria-checked', 'false');
  });
});
