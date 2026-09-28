'use client';

import { Suspense } from 'react';

import { DesignSystemGallery } from 'src/components/gallery/DesignSystemGallery';
import { UbPageSkeleton } from 'src/design-system';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/parties';
import 'src/i18n/catalogues/share';

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
