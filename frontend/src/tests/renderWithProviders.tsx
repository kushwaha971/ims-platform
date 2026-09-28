import type { ReactElement, ReactNode } from 'react';

import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Provider } from 'react-redux';

import { formattingLocale } from 'src/i18n/formattingLocale';
import { localeChanged } from 'src/redux/slice/localeSlice';
import { store } from 'src/redux/store';
import { ALL_MESSAGES } from 'src/tests/allMessages';
import type { Locale } from 'src/types/domain.types';

/**
 * R-T-3 — component tests render through the real providers, so a test that
 * passes has exercised the same store, the same messages and the same theme the
 * user gets. MSW is deliberately not used (§19.13.3): services are mocked at the
 * module boundary instead.
 */
export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  readonly locale?: Locale;
  readonly messages?: Record<string, string>;
}

export const renderWithProviders = (
  ui: ReactElement,
  { locale = 'en', messages, ...options }: RenderWithProvidersOptions = {}
): RenderResult => {
  /**
   * The store's locale is put in step with the provider's.
   *
   * Two things read the locale and they are NOT the same source: `t()` reads
   * `IntlProvider`, while anything choosing between two strings it holds itself
   * — PLT-03's 38-row GST state list is the first — reads `localeSlice`. A
   * harness that set only the provider would render a Hindi screen with English
   * state names and call it a pass, which is precisely the defect an `hi` test
   * exists to catch.
   */
  store.dispatch(localeChanged(locale));

  const Wrapper = ({ children }: { readonly children: ReactNode }) => (
    <Provider store={store}>
      <IntlProvider
        /* `formattingLocale`, exactly as `IntlProviderShell` does it. This
           harness building its own provider is why the en-US date and number
           formats went unnoticed for so long: the tests and the product agreed
           with each other and both disagreed with the intent. */
        locale={formattingLocale(locale)}
        defaultLocale="en"
        /* Every catalogue at once (W4-P). The product loads each screen's
           words with its chunk; whether every screen loads the ones it renders
           is proved over the import graph by `scripts/check-locales.mjs`, so a
           test does not have to know which screen loads what. A key that is in
           NO catalogue still renders raw here, and the assertion on its text
           fails — the loud part is kept. */
        messages={messages ?? ALL_MESSAGES[locale]}
      >
        {children}
      </IntlProvider>
    </Provider>
  );

  return render(ui, { wrapper: Wrapper, ...options });
};
