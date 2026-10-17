import { UbPageShell, UbSkeleton } from 'src/design-system';
import type { UbSkeletonVariant } from 'src/design-system';

/**
 * Revamp F1 (docs/revamp/05 §7, 07-screens/02 "Route loading") — the view
 * every `(app)` route's `loading.tsx` re-exports.
 *
 * Without a `loading.tsx` the App Router shows nothing between a tap and the
 * new route's server payload arriving: the baseline measured 363 ms median and
 * 819 ms p95 of an unchanged screen on a throttled phone, and a loading state
 * appeared first in 0 of 57 navigations (docs/performance/2026-10-17). A
 * dynamic route's `loading.tsx` is also what `next/link` prefetches, so the
 * view is already on the phone when the merchant taps.
 *
 * It is drawn inside `UbPageShell` with a title placeholder, because the
 * page's own `UbPageSkeleton` fallback sits edge to edge with no title: on its
 * own it put a 390 px phone's rows flush against the screen edge, where no
 * real screen puts anything (R-DEC-07 screenshots, 17 Oct 2026). Four shapes,
 * one per kind of screen: a home, a list, a record, an editor.
 */
function RouteLoading({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return <UbPageShell header={<UbSkeleton variant="heading" />}>{children}</UbPageShell>;
}

function BodyLoading({ variant }: Readonly<{ variant: UbSkeletonVariant }>): React.JSX.Element {
  return (
    <RouteLoading>
      <UbSkeleton variant={variant} />
    </RouteLoading>
  );
}

/**
 * A home is figures, then panels. Not the `app` variant: that one pads itself
 * for use OUTSIDE a page shell (the session gate), and inside one it indented
 * the body 16 px past the title.
 */
export function HomeLoading(): React.JSX.Element {
  return (
    <RouteLoading>
      <UbSkeleton variant="card" />
      <UbSkeleton variant="list" count={3} />
    </RouteLoading>
  );
}

export function ListLoading(): React.JSX.Element {
  return <BodyLoading variant="list" />;
}

export function DetailLoading(): React.JSX.Element {
  return <BodyLoading variant="card" />;
}

export function FormLoading(): React.JSX.Element {
  return <BodyLoading variant="form" />;
}
