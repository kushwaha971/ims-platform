import { APP_NAME } from 'src/constants';

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
    <article className="mx-auto flex max-w-md flex-col gap-3 rounded-card border border-border-hairline bg-surface-card p-6">
      <h1 className="ds-h3 text-text-primary">This link has expired</h1>
      <p className="ds-body-sm text-text-tertiary">Ask the shop to share the document again.</p>
      <p className="ds-mono text-text-muted">{token.slice(0, 8)}</p>
      <p className="ds-caption text-text-muted">Powered by {APP_NAME}</p>
    </article>
  );
}
