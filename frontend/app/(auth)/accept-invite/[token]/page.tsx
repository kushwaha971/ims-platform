'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { AcceptInvitePageContent } from 'modules/DigiKhaato/features/team/components/AcceptInvitePageContent';

/**
 * PLT-05 FR-10 — where an invitation link lands.
 *
 * This route did not exist until the flow was run end to end. The server built
 * `accept_url` pointing here and the Team screen showed it under "copy this, it
 * will not be shown again" — so the product was handing merchants a link that
 * answered 404. Neither half was wrong on its own: the backend owned the URL,
 * the frontend owned the screen that displays it, and nobody owned the
 * destination. It took running both tiers together to see it.
 */
export default function AcceptInvitePage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>): React.JSX.Element {
  const { token } = use(params);

  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={2} />}>
      <AcceptInvitePageContent token={token} />
    </Suspense>
  );
}
