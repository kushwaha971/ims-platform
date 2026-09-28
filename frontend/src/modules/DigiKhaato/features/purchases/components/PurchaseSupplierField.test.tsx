import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UbFieldRenderProps } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { PurchaseSupplierField } from './PurchaseSupplierField';

jest.mock('../../parties/api/partyService', () => ({
  listParties: jest.fn(async () => ({
    rows: [
      { id: 's1', name: 'Gupta Wholesale', mobile: null, isSupplier: true, balance: '0.00' },
      { id: 's2', name: 'Gupta Agro', mobile: null, isSupplier: true, balance: '0.00' },
    ],
    count: 2,
  })),
}));

const field = {
  id: 'partyId',
  name: 'partyId',
  value: '',
  onChange: jest.fn(),
  onBlur: jest.fn(),
  ref: jest.fn(),
  disabled: false,
  invalid: false,
  'aria-invalid': false,
  'aria-required': true,
  'aria-describedby': undefined,
  placeholder: 'Search suppliers',
} as unknown as UbFieldRenderProps;

function Field({ onPick }: Readonly<{ onPick: (id: string, name: string) => void }>) {
  const { t } = useTranslation();
  return (
    <PurchaseSupplierField field={field} supplierName="" onPick={onPick} disabled={false} t={t} />
  );
}

beforeEach(() => {
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
      activeTenant: { id: 't1', name: 'Sharma General Store', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Sharma General Store', timezone: 'Asia/Kolkata' }],
      permissions: ['parties.party.read', 'purchases.bill.write'],
      enabledModules: ['parties', 'purchases'],
      version: 1,
    })
  );
});

it('P-D6: supplier matches are a listbox of options, pickable with the arrow keys', async () => {
  /* QA P-D6 — the supplier search results were plain buttons with no
     role="option", so a screen reader heard no list and the arrow keys did nothing. */
  const user = userEvent.setup();
  const onPick = jest.fn();
  renderWithProviders(<Field onPick={onPick} />);
  const input = screen.getByRole('combobox');
  await user.type(input, 'Gup');
  const options = await screen.findAllByRole('option');
  expect(options.map((o) => o.textContent)).toEqual(['Gupta Wholesale', 'Gupta Agro']);
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  expect(input).toHaveAttribute('aria-expanded', 'true');
  expect(options[0]).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onPick).toHaveBeenCalledWith('s2', 'Gupta Agro');
});
