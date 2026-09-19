import { UbBox } from 'src/design-system';

/** Part 19 §19.6.1 — the `(internal)` group: bare plus gallery chrome. */
export default function InternalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <UbBox as="main" className="min-h-dvh bg-canvas">
      {children}
    </UbBox>
  );
}
