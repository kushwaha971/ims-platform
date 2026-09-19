import Link from 'next/link';

/** Part 19 §19.12.1 — the root not-found page; no shell, no store. */
export default function NotFound(): React.JSX.Element {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
      <h1 className="ds-h2 text-text-primary">404</h1>
      <p className="ds-body text-text-tertiary">This page does not exist.</p>
      <Link href="/parties" className="ds-body-medium text-text-accent underline">
        Go back
      </Link>
    </main>
  );
}
