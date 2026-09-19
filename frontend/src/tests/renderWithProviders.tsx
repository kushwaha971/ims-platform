import type { ReactElement, ReactNode } from 'react';

import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Provider } from 'react-redux';

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
