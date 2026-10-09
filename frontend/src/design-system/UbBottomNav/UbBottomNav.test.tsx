import { render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';

import { UbBottomNav } from 'src/design-system/UbBottomNav';

/**
 * `UbBottomNav` — the phone's navigation bar. It is presentational, so what is
 * asserted is the contract every caller relies on: a named landmark, links with
 * words, the current page announced, phones only, and the marker the CSS uses
 * to lift sticky bars and the FAB above it.
 */
const items = [
  { key: 'home', href: '/dashboard', label: 'Home', icon: <House aria-hidden />, active: true },
  {
    key: 'more',
    href: '/more',
    label: 'More',
    icon: <House aria-hidden />,
    badge: 3,
    badgeLabel: 'need attention',
  },
];

describe('UbBottomNav', () => {
  it('is a named navigation landmark of labelled links', () => {
    /* Prevents: an icon-only bar (a blank to anyone who does not know the
       icon) and a second unnamed `nav` beside the rail. */
    render(<UbBottomNav label="Main menu" items={items} />);
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/dashboard');
  });

  it('marks the current tab for assistive technology, not by colour alone', () => {
    render(<UbBottomNav label="Main menu" items={items} />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /More/ })).not.toHaveAttribute('aria-current');
  });

  it('says what a badge counts', () => {
    render(<UbBottomNav label="Main menu" items={items} />);
    expect(screen.getByRole('link', { name: 'More 3 need attention' })).toBeInTheDocument();
  });

  it('is phone-only, fixed, hidden on paper and marked for the offset rule', () => {
    /* Prevents: the bar showing on desktop beside the rail, printing at the
       foot of a statement, or covering a sticky Save bar (which reads
       `--ub-nav-offset`, set only while `[data-ub-bottom-nav]` is present). */
    render(<UbBottomNav label="Main menu" items={items} />);
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveClass('fixed', 'bottom-0', 'lg:hidden');
    expect(nav).toHaveAttribute('data-ub-bottom-nav');
    expect(nav).toHaveAttribute('data-print', 'hide');
  });
});
