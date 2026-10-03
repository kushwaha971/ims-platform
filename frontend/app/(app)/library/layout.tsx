import { RequireModule } from 'src/components/layout/RequireModule';

/**
 * F01 (G1) — every `/library/...` page renders only while the library module
 * is on for this business; otherwise not found. The pages themselves arrive
 * with F02 onward.
 */
export default function LibraryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return <RequireModule module="library">{children}</RequireModule>;
}
