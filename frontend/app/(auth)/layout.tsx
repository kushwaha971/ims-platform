import { UbBox, UbStack } from 'src/design-system';

/**
 * Part 19 §19.6.1 — the `(auth)` group: a centred card on the canvas, a brand
 * mark, no shell. A static server component: it renders providers' children and
 * fetches nothing.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <UbStack
      as="main"
      direction="row"
      align="center"
      justify="center"
      className="min-h-dvh bg-canvas px-4 py-10"
    >
      <UbBox className="w-full max-w-sm rounded-card border border-border-hairline bg-surface-card p-6 shadow-2">
        {children}
      </UbBox>
    </UbStack>
  );
}
