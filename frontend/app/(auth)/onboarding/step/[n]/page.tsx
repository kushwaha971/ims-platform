'use client';

import { Suspense, use } from 'react';

import { notFound } from 'next/navigation';

import { UbPageSkeleton } from 'src/design-system';

import { OnboardingStepPageContent } from 'modules/DigiKhaato/features/onboarding/components/OnboardingStepPageContent';

/**
 * PLT-03 §7 / FR-9 — the wizard's step is the URL, so a resume is a redirect
 * and a Back gesture is a step back.
 *
 * Part 19 §19.1.4: this is the entire file. The one thing it does beyond
 * rendering the content is reject a step number that is not 1–4 — a 404 is the
 * honest answer for `/onboarding/step/9`, and letting it through would render
 * an empty frame.
 *
 * The route lives in the `(auth)` group, per Part 19 §19.6.1's table ("(auth):
 * login, OTP, password set/reset, ONBOARDING WIZARD"). PLT-03 §7 names an
 * `(onboarding)` group instead; Part 19 owns the route-group decision and the
 * discrepancy is recorded in the sprint report.
 */
export default function OnboardingStepPage({
  params,
}: Readonly<{ params: Promise<{ n: string }> }>): React.JSX.Element {
  const { n } = use(params);
  const step = Number(n);
  if (!Number.isInteger(step) || step < 1 || step > 4) notFound();

  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={3} />}>
      <OnboardingStepPageContent step={step} />
    </Suspense>
  );
}
