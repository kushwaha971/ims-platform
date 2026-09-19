'use client';

import { Suspense } from 'react';

import { DesignSystemGallery } from 'src/components/gallery/DesignSystemGallery';
import { UbPageSkeleton } from 'src/design-system';

/**
 * Part 23 §23.4 — the live gallery: every Ub* wrapper in every state, for
 * visual review. Storybook is deliberately not a dependency (ADR-021).
 */
export default function DesignSystemPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <DesignSystemGallery />
    </Suspense>
  );
}
