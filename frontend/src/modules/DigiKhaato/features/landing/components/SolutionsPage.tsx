import { GooglePublicTracker } from 'src/analytics/GooglePublicTracker';
import { UbActionLink, UbBox, UbJsonLd, UbLink, UbStack, UbText } from 'src/design-system';
import { ROUTES } from 'src/routes';
import { absoluteUrl } from 'src/utils/seo';

import { SOLUTIONS, type Solution } from '../config/solutions';

/** English public editorial pages. Hindi remains available in the application;
 * separate Hindi URLs will be introduced with reviewed translated content.
 */
export function SolutionsPage({ solution }: Readonly<{ solution?: Solution }>): React.JSX.Element {
  const path = solution ? `/solutions/${solution.slug}` : '/solutions';
  const title = solution?.name ?? 'Business solutions on one shared platform';
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${absoluteUrl(path)}#page`,
        url: absoluteUrl(path),
        name: title,
        description:
          solution?.description ??
          'Explore YourKhata modules for billing, inventory, libraries and lending records.',
        isPartOf: { '@id': `${absoluteUrl('/')}#website` },
        inLanguage: 'en-IN',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'YourKhata', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: 'Solutions', item: absoluteUrl('/solutions') },
          ...(solution
            ? [{ '@type': 'ListItem', position: 3, name: solution.name, item: absoluteUrl(path) }]
            : []),
        ],
      },
      ...(solution
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: solution.questions.map(({ question, answer }) => ({
                '@type': 'Question',
                name: question,
                acceptedAnswer: { '@type': 'Answer', text: answer },
              })),
            },
          ]
        : []),
    ],
  };
  return (
    <UbBox lang="en" className="bg-surface-page min-h-screen text-text-primary">
      <UbJsonLd data={graph} />
      <GooglePublicTracker />
      <UbBox as="header" className="border-b border-border-hairline">
        <UbStack
          direction="row"
          wrap
          justify="between"
          align="center"
          gap={4}
          className="mx-auto max-w-5xl px-6 py-6"
        >
          <UbLink href="/" variant="h3" underline={false}>
            YourKhata
          </UbLink>
          <UbStack as="nav" aria-label="Public navigation" direction="row" wrap gap={4}>
            <UbLink href="/solutions">Solutions</UbLink>
            <UbLink href={ROUTES.LOGIN}>Sign in</UbLink>
          </UbStack>
        </UbStack>
      </UbBox>
      <UbStack as="main" gap={8} className="mx-auto max-w-5xl px-6 py-12 md:py-20">
        <UbBox as="nav" aria-label="Breadcrumb">
          <UbLink href="/">Home</UbLink>
          {' / '}
          <UbLink href="/solutions">Solutions</UbLink>
          {solution ? ` / ${solution.name}` : ''}
        </UbBox>
        <UbText as="h1" variant="h1">
          {title}
        </UbText>
        <UbText variant="body" tone="secondary">
          {solution?.description ??
            'YourKhata is a modular business-management platform. Choose a workflow for your business, with shared people, money, documents, reports and team access.'}
        </UbText>
        {solution ? (
          <>
            <UbBox as="section">
              <UbText as="h2" variant="h2">
                Who is it for?
              </UbText>
              <UbText className="mt-4">{solution.audience}</UbText>
            </UbBox>
            <UbBox as="section">
              <UbText as="h2" variant="h2">
                Keep daily records together
              </UbText>
              <UbText className="mt-4">{solution.problem}</UbText>
            </UbBox>
            <UbBox as="section">
              <UbText as="h2" variant="h2">
                What you can do
              </UbText>
              <UbStack as="ul" gap={3} className="mt-4 list-disc pl-6">
                {solution.features.map((feature) => (
                  <UbBox as="li" key={feature}>
                    <UbText>{feature}</UbText>
                  </UbBox>
                ))}
              </UbStack>
            </UbBox>
            <UbBox as="section">
              <UbText as="h2" variant="h2">
                How to get started
              </UbText>
              <UbStack as="ol" gap={3} className="mt-4 list-decimal pl-6">
                {solution.steps.map((step) => (
                  <UbBox as="li" key={step}>
                    <UbText>{step}</UbText>
                  </UbBox>
                ))}
              </UbStack>
            </UbBox>
            <UbBox as="section">
              <UbText as="h2" variant="h2">
                Common questions
              </UbText>
              <UbStack gap={6} className="mt-6">
                {solution.questions.map(({ question, answer }) => (
                  <UbBox key={question}>
                    <UbText as="h3" variant="h3">
                      {question}
                    </UbText>
                    <UbText className="mt-3">{answer}</UbText>
                  </UbBox>
                ))}
              </UbStack>
            </UbBox>
          </>
        ) : (
          <UbBox as="section">
            <UbText as="h2" variant="h2">
              Choose the records your business needs
            </UbText>
            <UbText className="mt-4">
              Start with the available solutions below. New modules can build on the same platform
              as they are released.
            </UbText>
          </UbBox>
        )}
        <UbBox as="section">
          <UbText as="h2" variant="h2">
            {solution ? 'Explore other solutions' : 'Available solutions'}
          </UbText>
          <UbStack gap={6} className="mt-6">
            {SOLUTIONS.filter((entry) => entry.slug !== solution?.slug).map((entry) => (
              <UbBox
                key={entry.slug}
                className="rounded-lg border border-border-hairline bg-surface-card p-6"
              >
                <UbText as="h3" variant="h3">
                  <UbLink href={`/solutions/${entry.slug}`} variant="h3">
                    {entry.name}
                  </UbLink>
                </UbText>
                <UbText tone="secondary" className="mt-3">
                  {entry.description}
                </UbText>
              </UbBox>
            ))}
          </UbStack>
        </UbBox>
        <UbStack as="section" gap={4}>
          <UbText as="h2" variant="h2">
            Start with your business records
          </UbText>
          <UbText>
            YourKhata works in a browser on phone or computer. The application supports Hindi and
            English.
          </UbText>
          <UbActionLink href={ROUTES.SIGNUP} variant="primary" className="self-start">
            Create your account
          </UbActionLink>
        </UbStack>
      </UbStack>
      <UbStack
        as="footer"
        direction="row"
        wrap
        gap={6}
        className="mx-auto max-w-5xl border-t border-border-hairline px-6 py-8"
      >
        <UbLink href="/">YourKhata</UbLink>
        <UbLink href="/legal/privacy">Privacy</UbLink>
        <UbLink href="/legal/terms">Terms</UbLink>
      </UbStack>
    </UbBox>
  );
}
