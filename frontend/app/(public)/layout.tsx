import { UbBox } from 'src/design-system';

/**
 * Part 19 §19.6.1 — the `(public)` group: bare, server-rendered, no store, no
 * shell and no navigation into the app. It is the shop's page: nothing on it
 * names the product (CR-2026-09-29-BRAND-A).
 */
export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    // `print:` — the share page's Save as PDF puts only the A4 sheet on paper,
    // so the page's own gutters must not become a second margin inside @page.
    <UbBox as="main" className="min-h-dvh bg-canvas px-4 py-8 print:bg-white print:p-0">
      {children}
    </UbBox>
  );
}
