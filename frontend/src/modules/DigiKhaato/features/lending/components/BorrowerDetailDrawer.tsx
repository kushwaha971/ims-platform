'use client';
import { CompactDrawer } from 'src/components/records/CompactOverlays';
import { useTranslation } from 'src/hooks/useTranslation';

import { LoansPageContent } from './LoansPageContent';
import 'src/i18n/catalogues/lending';
export function BorrowerDetailDrawer({
  id,
  onClose,
}: Readonly<{ id: string; onClose: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <CompactDrawer
      open
      title={t('lending.borrower.details')}
      closeLabel={t('common.action.close')}
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-2xl"
    >
      <LoansPageContent borrowerId={id} embedded />
    </CompactDrawer>
  );
}
