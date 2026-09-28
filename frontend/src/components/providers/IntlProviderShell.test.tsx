import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { IntlProviderShell } from 'src/components/providers/IntlProviderShell';
import { UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import 'src/i18n/catalogues/legal';
import { localeChanged } from 'src/redux/slice/localeSlice';
import { store } from 'src/redux/store';
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

/**
 * W4-P — the product's provider, not the test harness's. `renderWithProviders`
 * hands IntlProvider every catalogue at once, so it cannot show that a screen's
 * catalogue, registered by importing its module (`legal`, above), reaches the
 * shell's provider, nor that Hindi arrives for the shell and the screen alike.
 */
describe('the shell provider with a route-local catalogue', () => {
  function Words(): React.JSX.Element {
    const { t } = useTranslation();
    return (
      <>
        <UbText>{t('common.action.dismiss')}</UbText>
        <UbText>{t('legal.terms.title')}</UbText>
      </>
    );
  }

  const renderShell = () =>
    render(
      <Provider store={store}>
        <IntlProviderShell>
          <Words />
        </IntlProviderShell>
      </Provider>
    );

  afterEach(() => {
    act(() => {
      store.dispatch(localeChanged('en'));
    });
  });

  it('renders a registered catalogue’s words on the first render, in English', () => {
    store.dispatch(localeChanged('en'));
    renderShell();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
    expect(screen.getByText('Terms of Service')).toBeInTheDocument();
  });

  it('switches the shell and the screen to Hindi once their Hindi halves land', async () => {
    store.dispatch(localeChanged('hi'));
    renderShell();
    // English stands in until the chunks land — never a raw id.
    expect(screen.queryByText('legal.terms.title')).not.toBeInTheDocument();
    expect(await screen.findByText('सेवा की शर्तें')).toBeInTheDocument();
    expect(await screen.findByText('हटाएँ')).toBeInTheDocument();
  });
});
