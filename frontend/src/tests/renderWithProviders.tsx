import type { ReactElement, ReactNode } from 'react';

import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Provider } from 'react-redux';

import { localeChanged } from 'src/redux/slice/localeSlice';
import { store } from 'src/redux/store';
import type { Locale } from 'src/types/domain.types';

import en from 'locales/en.json';

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
        locale={locale}
        defaultLocale="en"
        messages={messages ?? (en as Record<string, string>)}
      >
        {children}
      </IntlProvider>
    </Provider>
  );

  return render(ui, { wrapper: Wrapper, ...options });
};
