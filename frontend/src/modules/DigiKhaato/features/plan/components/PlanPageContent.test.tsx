import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { limitHit, resetPlan } from '../redux/planSlice';
import { toPlanLimitHit } from '../view-model/planDisplay';

import { PlanLimitDialog } from './PlanLimitDialog';
import { PlanPageContent } from './PlanPageContent';

/**
 * PLT-15, end to end inside the client (§19.13.3), built to **DEC-001**.
 *
 * The screen's job at MVP is small on purpose: the modules, the member count,
 * and the promise that the ledger is never capped. There is no party counter
 * and no invoice meter to test, because neither is enforced on any MVP plan —
 * a test asserting one would be asserting a surface the product must not have.
 */
jest.mock('../api/planService');

const planService = jest.requireMock('../api/planService') as { getPlanEntitlements: jest.Mock };

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/settings/plan',
}));

const entitlements = (over: Record<string, unknown> = {}) => ({
  planCode: 'free',
  limits: [{ key: 'max_users', limit: 3, used: 1, periodStart: null, periodEnd: null }],
  modules: ['ledger', 'parties'],
  supportContact: { phone: null, whatsapp: '+919000000000', email: null, name: 'Metis' },
  ...over,
});

beforeEach(() => {
  store.dispatch(resetPlan());
  jest.clearAllMocks();
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Ramesh',
        email: 'ramesh@example.com',
        mobile: '+919876543210',
        locale: 'en',
      },
      activeTenant: { id: 't1', name: 'Sharma', timezone: 'Asia/Kolkata' },
      tenants: [],
      permissions: [],
      enabledModules: [],
      version: 1,
    })
  );
});

describe('PlanPageContent — the four states of the card', () => {
  it('paints a skeleton first, then the member count', async () => {
    planService.getPlanEntitlements.mockResolvedValue(entitlements());

    renderWithProviders(<PlanPageContent />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('1 of 3 team members used')).toBeInTheDocument();
    // DEC-001 — the one promise this screen exists to make.
    expect(screen.getAllByText('Udhaar entries are never limited.').length).toBeGreaterThan(0);
  });

  it('meters the member count and NOTHING else (DEC-001)', async () => {
    planService.getPlanEntitlements.mockResolvedValue(
      entitlements({
        limits: [
          { key: 'max_users', limit: 3, used: 2, periodStart: null, periodEnd: null },
          { key: 'max_parties', limit: null, used: 412, periodStart: null, periodEnd: null },
          {
            key: 'max_invoices_per_month',
            limit: null,
            used: 88,
            periodStart: null,
            periodEnd: null,
          },
        ],
      })
    );

    renderWithProviders(<PlanPageContent />);
    await screen.findByText('2 of 3 team members used');

    // Exactly one progress bar: the member one. No party or invoice meter.
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    // The uncapped ones say so rather than showing a bar that cannot fill.
    expect(screen.getAllByText('Unlimited')).toHaveLength(2);
  });

  it('says "no limits" rather than apologising for an empty list', async () => {
    planService.getPlanEntitlements.mockResolvedValue(entitlements({ limits: [], planCode: null }));

    renderWithProviders(<PlanPageContent />);

    expect(await screen.findByText('No limits on this business.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows the error state with its request id and a retry', async () => {
    const user = userEvent.setup();
    planService.getPlanEntitlements.mockRejectedValue({
      code: 'server_error',
      message: 'Something went wrong.',
      details: {},
      requestId: 'req_8',
      status: 500,
      warnings: [],
    });

    renderWithProviders(<PlanPageContent />);

    expect(await screen.findByText('We could not load your plan')).toBeInTheDocument();
    expect(screen.getByTestId('request-id')).toHaveTextContent('req_8');

    planService.getPlanEntitlements.mockResolvedValue(entitlements());
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('1 of 3 team members used')).toBeInTheDocument();
  });
});

describe('PlanPageContent — FR-7 the pre-warning', () => {
  it('stays silent well below the limit', async () => {
    planService.getPlanEntitlements.mockResolvedValue(entitlements());
    renderWithProviders(<PlanPageContent />);
    await screen.findByText('1 of 3 team members used');
    expect(screen.queryByText('You are close to the limit for this plan.')).not.toBeInTheDocument();
  });

  it('warns at 80 % of the member count', async () => {
    planService.getPlanEntitlements.mockResolvedValue(
      entitlements({
        limits: [{ key: 'max_users', limit: 5, used: 4, periodStart: null, periodEnd: null }],
      })
    );

    renderWithProviders(<PlanPageContent />);

    expect(
      await screen.findByText('You are close to the limit for this plan.')
    ).toBeInTheDocument();
  });

  it('names who to contact once the limit is reached', async () => {
    planService.getPlanEntitlements.mockResolvedValue(
      entitlements({
        limits: [{ key: 'max_users', limit: 3, used: 3, periodStart: null, periodEnd: null }],
      })
    );

    renderWithProviders(<PlanPageContent />);

    expect(await screen.findByText('Contact Metis to add more.')).toBeInTheDocument();
    expect(screen.getByText('Limit reached')).toBeInTheDocument();
  });
});

describe('PlanLimitDialog — FR-4 / FR-6', () => {
  const open403 = (details: Record<string, unknown>) => {
    store.dispatch(
      limitHit(
        toPlanLimitHit({
          code: 'plan_limit_reached',
          message: "Your plan's limit has been reached.",
          details,
          requestId: 'req_9',
          status: 403,
          warnings: [],
        })
      )
    );
  };

  /**
   * The `D` envelope `entitlements.raise_plan_limit` actually sends: scalars at
   * the top level of `details`, with `support_contact` NESTED. This case used
   * to build it as `limit: ['3']` and two literal dotted keys
   * (`'support_contact.whatsapp'`), neither of which the server emits — so it
   * certified a dialog that, against a real 403, said "You have used null of
   * null team members on the f plan" and offered no way to contact anybody.
   */
  it('names the count, the plan and the contact route', async () => {
    open403({
      limit_key: 'max_users',
      limit: 3,
      used: 3,
      plan_code: 'free',
      support_contact: { whatsapp: '+919000000000', name: 'Metis' },
    });

    renderWithProviders(<PlanLimitDialog />);

    expect(await screen.findByRole('dialog', { name: 'Plan limit reached' })).toBeInTheDocument();
    expect(
      screen.getByText('You have used 3 of 3 team members on the free plan.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contact Metis' })).toBeInTheDocument();
    // R-E-4 — the reference the merchant quotes to support.
    expect(screen.getByTestId('request-id')).toHaveTextContent('req_9');
  });

  it('restates that the ledger is never capped, where the fear is (DEC-001)', () => {
    open403({ limit_key: 'max_users', limit: 3, used: 3 });
    renderWithProviders(<PlanLimitDialog />);
    expect(screen.getByText('Udhaar entries are never limited.')).toBeInTheDocument();
  });

  it('offers no dead link when the partner has no support contact (§9 Failed)', () => {
    open403({ limit_key: 'max_users', limit: 3, used: 3 });
    renderWithProviders(<PlanLimitDialog />);

    expect(screen.getByRole('button', { name: 'Contact your provider' })).toBeDisabled();
  });

  it('closes without disturbing anything the user had typed', async () => {
    const user = userEvent.setup();
    open403({ limit_key: 'max_users', limit: 3, used: 3 });

    renderWithProviders(<PlanLimitDialog />);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    // The dialog is a SIBLING of the form, so closing it touches no form state.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(store.getState().plan.dialogOpen).toBe(false);
  });

  it('renders nothing at all before any limit has been hit', () => {
    renderWithProviders(<PlanLimitDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
