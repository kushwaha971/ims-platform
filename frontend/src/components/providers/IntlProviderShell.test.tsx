import { screen } from '@testing-library/react';

import { UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { renderWithProviders } from 'src/tests/renderWithProviders';

/**
 * The formatting locale, which is not the message locale.
 *
 * `d()` documents itself as "dd/mm/yyyy in both locales" and `n()` as "en-IN
 * grouping for en/hi". Both were false for English: the provider was handed the
 * bare tag `en`, which `Intl` resolves as en-US, so dates came out month-first
 * and amounts in thousands rather than lakhs. Nothing failed — every assertion
 * in the suite was written against the output rather than the intent — and it
 * was found by reading a date off a screenshot.
 */
function Probe(): React.JSX.Element {
  const { d, n } = useTranslation();
  return (
    <>
      <UbText>{d('2026-09-28T00:00:00Z')}</UbText>
      <UbText>{n(1234567)}</UbText>
    </>
  );
}

describe('the formatting locale', () => {
  it('reads dates day-first for an English-speaking Indian merchant', () => {
    renderWithProviders(<Probe />);
    expect(screen.getByText('28/09/2026')).toBeInTheDocument();
  });

  it('groups money in lakhs, not thousands', () => {
    // 12,34,567 is how a shopkeeper reads this number. 1,234,567 is one they
    // have to stop and count, in a ledger app where reading the balance at a
    // glance is the entire product.
    renderWithProviders(<Probe />);
    expect(screen.getByText('12,34,567')).toBeInTheDocument();
  });
});
