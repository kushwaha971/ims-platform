import { screen } from '@testing-library/react';

import { resetAllFeatureState } from 'src/redux/actions';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/libraryAttendanceService';

import { MemberAttendanceStrip } from './MemberAttendanceStrip';

/**
 * W05 — the student page's month. Found by looking: a student who joined
 * today read "1 of 5 days" on the 5th, counting four days before they joined
 * as days missed. Their month starts on the day they joined.
 */
jest.mock('../api/libraryAttendanceService', () => ({
  ...jest.requireActual('../api/libraryAttendanceService'),
  getMemberAttendance: jest.fn(),
}));

const t = (id: string, params?: Record<string, unknown>) =>
  id === 'library.attendance.daysOf' ? `${params?.came} of ${params?.days} days` : id;

beforeEach(() => {
  store.dispatch(resetAllFeatureState());
  jest.clearAllMocks();
});

describe('MemberAttendanceStrip', () => {
  it('counts from the day a student joined this month', async () => {
    jest.mocked(service.getMemberAttendance).mockResolvedValue(['2026-10-05']);
    renderWithProviders(
      <MemberAttendanceStrip membershipId="m1" startsOn="2026-10-05" today="2026-10-05" t={t} />
    );
    expect(await screen.findByText('1 of 1 days')).toBeInTheDocument();
  });

  it('counts the whole month for a student who joined before it', async () => {
    jest.mocked(service.getMemberAttendance).mockResolvedValue(['2026-10-01', '2026-10-03']);
    renderWithProviders(
      <MemberAttendanceStrip membershipId="m1" startsOn="2026-07-04" today="2026-10-05" t={t} />
    );
    expect(await screen.findByText('2 of 5 days')).toBeInTheDocument();
  });
});
