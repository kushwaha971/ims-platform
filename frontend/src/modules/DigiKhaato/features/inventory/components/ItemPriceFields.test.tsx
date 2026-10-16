import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { ItemPriceFields } from './ItemPriceFields';

import type { ItemFormValues } from '../types/item.types';
import type { Gst } from '../view-model/itemPricing';

/**
 * WP-07 — the item form's selling price, purchase price and margin moving
 * together. The arithmetic is `priceAfterEdit`'s and is pinned there; these pin
 * the WIRING: that each box drives the one the review says it drives, that the
 * margin is unusable until there is a cost, and that a member who may not see
 * costs is shown no cost box at all (the server would refuse what they typed).
 */
function Harness({
  canSeeCost = true,
  gst = {},
  values = {},
}: Readonly<{ canSeeCost?: boolean; gst?: Gst; values?: Partial<ItemFormValues> }>) {
  const form = useForm<ItemFormValues>({
    defaultValues: { sellingPrice: '', purchasePrice: '', margin: '', ...values },
  });
  return (
    <FormProvider {...form}>
      <ItemPriceFields canSeeCost={canSeeCost} gst={gst} />
    </FormProvider>
  );
}

const box = (name: RegExp) => screen.getByRole('textbox', { name });

test('typing a margin sets the selling price, and leaving it shows the rounded margin', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Harness values={{ purchasePrice: '40.00' }} />);
  await user.type(box(/margin/i), '25');
  expect(box(/selling price/i)).toHaveValue('53.33');
  await user.tab();
  expect(box(/margin/i)).toHaveValue('25.0');
});

test('typing a selling price rereads the margin', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Harness values={{ purchasePrice: '40.00' }} />);
  await user.type(box(/selling price/i), '50');
  expect(box(/margin/i)).toHaveValue('20.0');
});

test('a new cost keeps a margin already held by repricing', async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <Harness values={{ sellingPrice: '50.00', purchasePrice: '40.00', margin: '20.0' }} />
  );
  await user.clear(box(/purchase price/i));
  await user.type(box(/purchase price/i), '45');
  expect(box(/selling price/i)).toHaveValue('56.25');
});

test('the margin waits for a cost, and selling at a loss is said in words', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Harness values={{ sellingPrice: '35.00' }} />);
  expect(box(/margin/i)).toBeDisabled();
  expect(screen.getByText('Add the purchase price to see margin')).toBeInTheDocument();
  await user.type(box(/purchase price/i), '40');
  expect(box(/margin/i)).toHaveValue('-14.3');
  expect(screen.getByText('Selling below cost')).toBeInTheDocument();
});

test('reads the margin without GST when the price includes it', async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <Harness gst={{ inclusive: true, rate: '18', cess: '0' }} values={{ purchasePrice: '40.00' }} />
  );
  await user.type(box(/selling price/i), '59');
  expect(box(/margin/i)).toHaveValue('20.0');
});

test('a member who cannot see costs gets the selling price alone', () => {
  renderWithProviders(<Harness canSeeCost={false} />);
  expect(box(/selling price/i)).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: /purchase price/i })).toBeNull();
  expect(screen.queryByRole('textbox', { name: /margin/i })).toBeNull();
});
