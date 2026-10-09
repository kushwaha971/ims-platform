'use client';

import { useRouter } from 'next/navigation';

import { ArrowLeft } from 'lucide-react';

import { UbButton } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

/**
 * docs/mobile-redesign/03 §1 — Back, on a phone's detail and task screens.
 *
 * The bottom nav is not shown on a khata, a bill or a form (`mobileNavState`),
 * and the ☰ drawer it replaced is gone, so without this the only way off a
 * detail screen was the system's own back gesture — which a merchant who
 * arrived from a WhatsApp link does not have a page to go back to. It goes
 * back in history when there is any, and otherwise up to the tab the screen
 * lives under.
 */
export function MobileBackButton({
  upHref,
}: Readonly<{ upHref: string | null }>): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <UbButton
      variant="ghost"
      iconOnly
      onClick={() => {
        if (window.history.length > 1) router.back();
        else if (upHref) router.push(upHref);
      }}
      className="h-11 w-11 shrink-0 text-text-secondary"
      icon={<ArrowLeft aria-hidden className="h-5 w-5" />}
    >
      {t('common.action.back')}
    </UbButton>
  );
}
