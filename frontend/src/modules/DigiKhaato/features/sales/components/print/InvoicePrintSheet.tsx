'use client';

import { useTranslation } from 'src/hooks/useTranslation';
import type { PrintBranding } from 'src/print/brandingPrintService';
import type { Locale } from 'src/types/domain.types';

import { InvoicePrintA4 } from './InvoicePrintA4';
import { InvoicePrintThermal80 } from './InvoicePrintThermal80';

import type { PrintTemplate, SalesDocument, UpiIntent } from '../../types/sales.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/sales';

/**
 * SAL-03 FR-1 / FR-2 — the sheet `window.print()` prints: shown on screen as
 * the detail page's preview, and on paper the ONLY thing printed (everything
 * around it carries `ub-print-hide`). Loaded with `dynamic()` so the list and
 * the editor never download the print layouts.
 */
export function InvoicePrintSheet({
  doc,
  upi,
  branding,
  locale,
  template,
}: Readonly<{
  doc: SalesDocument;
  upi: UpiIntent | null;
  branding: PrintBranding | null;
  locale: Locale;
  template: PrintTemplate;
}>): React.JSX.Element {
  const { t } = useTranslation();
  return template === 'thermal80' ? (
    <InvoicePrintThermal80 doc={doc} upi={upi} branding={branding} t={t} />
  ) : (
    <InvoicePrintA4 doc={doc} upi={upi} branding={branding} locale={locale} t={t} />
  );
}
