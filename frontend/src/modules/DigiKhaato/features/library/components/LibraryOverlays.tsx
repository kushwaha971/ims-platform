'use client';

import { UbDialog, UbDrawer, type UbDialogProps, type UbDrawerProps } from 'src/design-system';
import { cn } from 'src/utils/cn';

// Only Library overlays use this density; field sizes and safe areas stay intact.
export const LIBRARY_OVERLAY_CLASSNAME =
  '[&>div]:p-4 [&>div:last-child]:pb-[max(1rem,env(safe-area-inset-bottom,0px))]';

export function LibraryDrawer(props: Readonly<UbDrawerProps>): React.JSX.Element {
  return <UbDrawer {...props} className={cn(LIBRARY_OVERLAY_CLASSNAME, props.className)} />;
}

export function LibraryDialog(props: Readonly<UbDialogProps>): React.JSX.Element {
  return <UbDialog {...props} className={cn(LIBRARY_OVERLAY_CLASSNAME, props.className)} />;
}
