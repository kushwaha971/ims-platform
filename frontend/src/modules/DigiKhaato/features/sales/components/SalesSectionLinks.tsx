'use client';

import { ClipboardList, FileText, Undo2 } from 'lucide-react';

import { UbActionLink } from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

type Section = 'invoice' | 'estimate' | 'credit_note';

const SECTIONS: readonly {
  readonly key: Section;
  readonly href: string;
  readonly labelId: string;
  readonly permission: 'sales.invoice.read' | 'sales.estimate.read';
  readonly icon: typeof FileText;
}[] = [
  {
    key: 'invoice',
    href: ROUTES.SALES_INVOICES,
    labelId: 'sales.list.title',
    permission: 'sales.invoice.read',
    icon: FileText,
  },
  {
    key: 'estimate',
    href: ROUTES.SALES_ESTIMATES,
    labelId: 'sales.estimate.listTitle',
    permission: 'sales.estimate.read',
    icon: ClipboardList,
  },
  {
    key: 'credit_note',
    href: ROUTES.SALES_CREDIT_NOTES,
    labelId: 'sales.creditNote.listTitle',
    permission: 'sales.invoice.read',
    icon: Undo2,
  },
];

/**
 * The other two sales lists, as header links beside the page's own action.
 * Bills, estimates and credit notes are one menu item ("Invoices") because
 * they are one book of sales documents; these links are how a merchant moves
 * between them without a second and third sidebar row. Icon-only on a phone,
 * so the header stays one row (owner's rule).
 */
export function SalesSectionLinks({ current }: Readonly<{ current: Section }>): React.JSX.Element {
  const { t } = useTranslation();
  const { can } = usePermissions();
  return (
    <>
      {SECTIONS.filter((section) => section.key !== current && can(section.permission)).map(
        ({ key, href, labelId, icon: Icon }) => (
          <UbActionLink
            key={key}
            href={href}
            variant="secondary"
            iconOnly="mobile"
            icon={<Icon className="h-4 w-4" aria-hidden />}
            data-testid={`sales-section-${key}`}
          >
            {t(labelId)}
          </UbActionLink>
        )
      )}
    </>
  );
}
