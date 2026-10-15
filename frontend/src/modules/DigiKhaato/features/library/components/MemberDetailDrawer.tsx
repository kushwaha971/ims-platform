'use client';

import { useTranslation } from 'src/hooks/useTranslation';

import { LibraryDrawer } from './LibraryOverlays';
import { MemberDetailPageContent } from './MemberDetailPageContent';

import 'src/i18n/catalogues/payLink';

/** Reuses the authoritative student view and all existing permitted actions. */
export function MemberDetailDrawer({
  id,
  onClose,
}: Readonly<{ id: string; onClose: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <LibraryDrawer
      open
      title={t('library.member.contactDetails')}
      closeLabel={t('common.action.close')}
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-2xl"
    >
      <MemberDetailPageContent id={id} embedded />
    </LibraryDrawer>
  );
}
