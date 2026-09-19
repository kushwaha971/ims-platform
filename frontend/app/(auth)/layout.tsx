import { AuthShell } from 'modules/DigiKhaato/features/auth/components/AuthShell';

/**
 * Part 19 §19.6.1 — the `(auth)` group.
 *
 * CR-2026-09-19-D: what used to be here was the whole design — a `max-w-sm`
 * card, centred on an empty canvas, with no mark, no footer and no landmark but
 * `<main>`. The layout is now one line, and the page it renders is
 * `AuthShell`, which carries the reasoning for the shape it chose.
 *
 * It stays a static server component: it renders children and fetches nothing.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return <AuthShell>{children}</AuthShell>;
}
