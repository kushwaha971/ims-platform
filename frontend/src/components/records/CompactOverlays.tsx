'use client';

import { UbDialog, UbDrawer, type UbDialogProps, type UbDrawerProps } from 'src/design-system';
import { cn } from 'src/utils/cn';

// Opt-in compact overlays use this density; field sizes and safe areas stay intact.
export const COMPACT_OVERLAY_CLASSNAME =
  '[&>div]:p-4 [&>div:last-child]:pb-[max(1rem,env(safe-area-inset-bottom,0px))]';

export function CompactDrawer(props: Readonly<UbDrawerProps>): React.JSX.Element {
  return <UbDrawer {...props} className={cn(COMPACT_OVERLAY_CLASSNAME, props.className)} />;
}

export function CompactDialog(props: Readonly<UbDialogProps>): React.JSX.Element {
  return <UbDialog {...props} className={cn(COMPACT_OVERLAY_CLASSNAME, props.className)} />;
}
