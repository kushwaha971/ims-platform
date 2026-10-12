import { screen } from '@testing-library/react';

import { isPublicPath } from 'src/routes';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { metadata as authMetadata } from 'app/(auth)/layout';

import { SolutionsPage } from 'modules/DigiKhaato/features/landing/components/SolutionsPage';
import { SOLUTIONS } from 'modules/DigiKhaato/features/landing/config/solutions';
import { solutionMetadata } from 'modules/DigiKhaato/features/landing/utils/solutionMetadata';

it('keeps marketing routes public while excluding sign-in from indexing', () => {
  expect(isPublicPath('/solutions/shop-billing')).toBe(true);
  expect(isPublicPath('/parties/private-person')).toBe(false);
  expect(authMetadata.robots).toMatchObject({ index: false, follow: false });
});
it.each(SOLUTIONS)('renders crawlable content and matching FAQs for $slug', (solution) => {
  const { container } = renderWithProviders(<SolutionsPage solution={solution} />);
  expect(screen.getByRole('heading', { level: 1, name: solution.name })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Create your account' })).toHaveAttribute(
    'href',
    '/signup'
  );
  const json = JSON.parse(
    container.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}'
  );
  const faq = json['@graph'].find((node: Record<string, unknown>) => node['@type'] === 'FAQPage');
  expect(faq.mainEntity).toHaveLength(solution.questions.length);
  for (const { question, answer } of solution.questions) {
    expect(screen.getByText(question)).toBeInTheDocument();
    expect(screen.getByText(answer)).toBeInTheDocument();
  }
  expect(
    solutionMetadata(`/solutions/${solution.slug}`, solution.title, solution.description).alternates
      ?.canonical
  ).toBe(`https://yourkhata.com/solutions/${solution.slug}`);
});
