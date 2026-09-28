'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { TeamPageContent } from 'modules/DigiKhaato/features/team/components/TeamPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/team';
import 'src/i18n/catalogues/validation';

/**
 * PLT-05 — Settings → Team.
 *
 * Part 19 §19.1.4 — this is the ENTIRE file, and every application route looks
 * like it: a Suspense boundary and one page-content import. A route that grows
 * a useState, a useEffect or an import from src/api has been written in the
 * wrong place.
 *
 * The fallback is `list` rather than `card`: what arrives is a list of
 * invitations, and a skeleton that draws the wrong shape moves the page under
 * the reader the moment the real content lands.
 */
export default function TeamPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <TeamPageContent />
    </Suspense>
  );
}
