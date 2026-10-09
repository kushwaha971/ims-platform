'use client';

import { useRef, useState, type ReactNode } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { MoreHorizontal } from 'lucide-react';

import { useIsMobileLayer } from 'src/design-system/motion/useMediaQuery';
import { UbButton } from 'src/design-system/UbButton';
import { UbFab } from 'src/design-system/UbFab';

/** Fetched on the first ⋯ press: the sheet is a Radix dialog, not first paint. */
const UbActionSheet = dynamic(
  () => import('src/design-system/UbActionSheet/UbActionSheet').then((m) => m.UbActionSheet),
  { ssr: false }
);

export interface UbPageHeaderMobile {
  /** The ⋯ button's name and the sheet's title — "More actions". */
  readonly menuLabel: string;
  readonly closeLabel: string;
  /**
   * The screen's one primary action, as the phone's floating button. On a
   * desktop the same action is the `primaryAction` element at the end of the
   * header's row, exactly as before.
   */
  readonly primary?: {
    readonly label: string;
    readonly icon: ReactNode;
    readonly onClick?: () => void;
    readonly href?: string;
  };
}

/**
 * docs/mobile-redesign/05 — a list screen's header actions below `lg`: a ⋯
 * that opens them as worded rows (`UbActionSheet`), and the primary action as
 * the floating button in the thumb's reach. Everything here is `lg:hidden`;
 * the desktop header draws its actions inline, untouched.
 */
export function UbPageHeaderMobileActions({
  mobile,
  actions,
}: Readonly<{ mobile: UbPageHeaderMobile; actions?: ReactNode }>): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const { primary } = mobile;
  // Rendered only on a phone, so a desktop DOM has no second "Add" and no ⋯.
  const isMobile = useIsMobileLayer();
  if (!isMobile) return null;

  return (
    <>
      {actions ? (
        <div className="flex shrink-0 items-center lg:hidden">
          <UbButton
            ref={trigger}
            variant="ghost"
            iconOnly
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => {
              setOpened(true);
              setOpen(true);
            }}
            className="h-11 w-11 text-text-secondary"
            icon={<MoreHorizontal aria-hidden className="h-5 w-5" />}
          >
            {mobile.menuLabel}
          </UbButton>
          {opened && (
            <UbActionSheet
              open={open}
              onOpenChange={setOpen}
              title={mobile.menuLabel}
              closeLabel={mobile.closeLabel}
              returnFocusRef={trigger}
            >
              {actions}
            </UbActionSheet>
          )}
        </div>
      ) : null}
      {primary ? (
        <UbFab
          mobileOnly
          label={primary.label}
          icon={primary.icon}
          onClick={() => {
            if (primary.onClick) primary.onClick();
            else if (primary.href) router.push(primary.href);
          }}
        />
      ) : null}
    </>
  );
}
