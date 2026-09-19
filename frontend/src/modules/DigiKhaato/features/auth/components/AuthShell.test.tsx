import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbText } from 'src/design-system';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import en from 'locales/en.json';
import hi from 'locales/hi.json';

import { AuthShell } from './AuthShell';

/**
 * CR-2026-09-19-D — the `(auth)` page, as against the forms inside it.
 *
 * Every assertion here is a defect the owner named, turned into something that
 * fails if it comes back:
 *
 *   · no brand anywhere;
 *   · a form floating on an empty canvas, with no page around it;
 *   · the language toggle as the first element on the page;
 *   · "the terms" written as prose with no document behind it.
 *
 * It renders the shell with a stand-in child, so it tests the page and not any
 * one screen — which is the point: these four things are the same on all five
 * screens in the group, and that is what makes them a product rather than a
 * pile of forms.
 */
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/login',
}));

const Child = () => <UbText>the form</UbText>;

describe('AuthShell — the brand', () => {
  it('puts the mark and the wordmark at the top of the page', () => {
    renderWithProviders(
      <AuthShell>
        <Child />
      </AuthShell>
    );

    expect(screen.getByRole('img', { name: 'DigiKhaato' })).toBeInTheDocument();
  });

  it('sets the mark BEFORE the content, in the DOM as well as on the screen', () => {
    renderWithProviders(
      <AuthShell>
        <Child />
      </AuthShell>
    );

    const mark = screen.getByRole('img', { name: 'DigiKhaato' });
    const form = screen.getByText('the form');
    // Node.DOCUMENT_POSITION_FOLLOWING — the form comes after the mark.
    expect(mark.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('AuthShell — the page, not a floating card', () => {
  it('has both landmarks a page needs: a main and a contentinfo', () => {
    renderWithProviders(
      <AuthShell>
        <Child />
      </AuthShell>
    );

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('carries a copyright line in the footer', () => {
    renderWithProviders(
      <AuthShell>
        <Child />
      </AuthShell>
    );

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText(/©/)).toBeInTheDocument();
  });
});

describe('AuthShell — the legal line has documents behind it', () => {
  it('links "the terms" to a real route, and the privacy policy to another', () => {
    renderWithProviders(
      <AuthShell>
        <Child />
      </AuthShell>
    );

    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).getByRole('link', { name: en['auth.legal.terms'] as string })
    ).toHaveAttribute('href', '/legal/terms');
    expect(
      within(footer).getByRole('link', { name: en['auth.legal.privacy'] as string })
    ).toHaveAttribute('href', '/legal/privacy');
  });

  it('still states the adult-use restriction (BR-7), once, in the footer', () => {
    renderWithProviders(
      <AuthShell>
        <Child />
      </AuthShell>
    );

    expect(screen.getAllByText(en['auth.adultUse'] as string)).toHaveLength(1);
  });

  /**
   * Hindi puts its verb after the documents, which is why the sentence is five
   * keys and not one. If someone ever concatenates them in code, this fails.
   */
  it('reads as one sentence in Hindi, with the verb after the two documents', () => {
    renderWithProviders(
      <AuthShell>
        <Child />
      </AuthShell>,
      { locale: 'hi', messages: hi as Record<string, string> }
    );

    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toContain(
      `${hi['auth.legal.privacy']}${hi['auth.legal.suffix']}`.trim()
    );
  });
});

describe('AuthShell — the language control', () => {
  it('is at the BOTTOM of the page, not the top', () => {
    renderWithProviders(
      <AuthShell>
        <Child />
      </AuthShell>
    );

    const picker = screen.getByLabelText(en['auth.language.change'] as string);
    expect(screen.getByRole('contentinfo')).toContainElement(picker);

    // And after the content, which is the whole correction: it used to be the
    // first element on the page, above the product's own name.
    const form = screen.getByText('the form');
    expect(form.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('offers each language in its own script, and switches the page', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AuthShell>
        <Child />
      </AuthShell>
    );

    const picker = screen.getByLabelText(en['auth.language.change'] as string);
    expect(within(picker).getByRole('option', { name: 'English' })).toBeInTheDocument();
    // Never "Hindi": the only label a person who needs this control can read is
    // the one in their own script.
    expect(within(picker).getByRole('option', { name: 'हिन्दी' })).toBeInTheDocument();

    await user.selectOptions(picker, 'hi');
    expect(picker).toHaveValue('hi');
  });
});
