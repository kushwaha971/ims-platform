import { APP_NAME } from 'src/constants';
import { UbStack, UbText } from 'src/design-system';

/**
 * Part 19 §19.7.6 — the unauthenticated share view. It is a genuine server
 * component: no session, no store, no client bundle.
 *
 * Sprint 0 ships the ROUTE and its shape only; the document render arrives with
 * SAL-07 (Sprint 7), which is also when `publicApi` gets its first caller. A
 * token that resolves to nothing renders the expired page, which is already the
 * correct behaviour for every token today.
 */
export default async function PublicDocumentPage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>): Promise<React.JSX.Element> {
  const { token } = await params;

  return (
    <UbStack
      as="article"
      gap={3}
      className="mx-auto max-w-md rounded-card border border-border-hairline bg-surface-card p-6"
    >
      <UbText as="h1" variant="h3">
        This link has expired
      </UbText>
      <UbText variant="body-sm" tone="tertiary">
        Ask the shop to share the document again.
      </UbText>
      <UbText variant="mono" tone="muted">
        {token.slice(0, 8)}
      </UbText>
      <UbText variant="caption" tone="muted">
        Powered by {APP_NAME}
      </UbText>
    </UbStack>
  );
}
