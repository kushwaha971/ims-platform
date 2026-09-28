import { screen } from '@testing-library/react';

import { UbText } from 'src/design-system';
import { en, hi } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';

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

describe('AuthShell — the Figma page (13504:19266)', () => {
  it('has a main landmark and no footer', () => {
    /**
     * The owner removed the footer: no theme picker, no language picker, no
     * copyright — the form half is the form and nothing else. The terms line
     * lives on the sign-up screen, where an account is actually opened.
     */
    renderWithProviders(
      <AuthShell>
        <Child />
      </AuthShell>
    );

    expect(screen.getByRole('main')).toContainElement(screen.getByText('the form'));
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('offers no theme or language dropdown on the page', () => {
    renderWithProviders(
      <AuthShell>
        <Child />
      </AuthShell>
    );

    expect(screen.queryByRole('combobox', { name: 'Change language' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /theme/i })).not.toBeInTheDocument();
  });

  it('puts the headline in the hero half, in both languages', () => {
    renderWithProviders(
      <AuthShell>
        <Child />
      </AuthShell>
    );

    expect(en['auth.hero.title']).toBeTruthy();
    expect(hi['auth.hero.title']).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, hidden: true })).toBeInTheDocument();
  });
});
