import { RequireModule } from 'src/components/layout/RequireModule';

/** Every `/lending/...` page renders only while lending is on for this business. */
export default function LendingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return <RequireModule module="lending">{children}</RequireModule>;
}
