import { screen } from '@testing-library/react';

import { useTranslation } from 'src/hooks/useTranslation';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { DashboardMobileSummary } from './DashboardMobileSummary';

import type { DashboardTiles } from '../types/reports.types';

/**
 * The phone's top of Home (audit A7/A8). Pinned: the two morning numbers open
 * their lists, "Needs attention" lists only what actually needs it, and a
 * shortcut is offered only to a role that may use it.
 */
const tiles: DashboardTiles = {
  toCollect: { amount: '11260.00' },
  toPay: { amount: '5380.00' },
  overdue: { count: 2, amount: '5380.00' },
  dueToday: { count: 0, amount: '0.00' },
  lowStock: { count: 2, outCount: 1 },
  todaySales: { amount: '5010.00', count: 3, yesterdayAmount: '0.00' },
};

function Harness(props: { canBill: boolean }) {
  const { t } = useTranslation();
  return (
    <DashboardMobileSummary tiles={tiles} t={t} canBill={props.canBill} canBuy={false} canRemind />
  );
}

describe('DashboardMobileSummary', () => {
  it('leads with to collect and to pay, each opening its list', () => {
    renderWithProviders(<Harness canBill />);
    expect(screen.getByRole('link', { name: /To collect/ })).toHaveAttribute(
      'href',
      expect.stringContaining('balance=owes_me')
    );
    expect(screen.getByRole('link', { name: /To pay/ })).toHaveAttribute(
      'href',
      expect.stringContaining('balance=i_owe')
    );
  });

  it('lists only what needs attention — nothing due today means no "To collect today" row', () => {
    /* Prevents: a to-do list of zeros, which teaches a merchant to ignore it. */
    renderWithProviders(<Harness canBill />);
    expect(screen.getByRole('link', { name: /Overdue/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Low stock/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /To collect today/ })).not.toBeInTheDocument();
  });

  it('offers a shortcut only to a role that may use it', () => {
    renderWithProviders(<Harness canBill={false} />);
    expect(screen.queryByRole('link', { name: 'New bill' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New purchase' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Send reminders' })).toBeInTheDocument();
  });
});
