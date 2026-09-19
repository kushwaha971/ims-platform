'use client';

import { redirect } from 'next/navigation';

import { onboardingStepPath } from 'src/routes';

/**
 * PLT-03 FR-9 — `/onboarding` alone is not a screen; the wizard's steps are.
 * The redirect exists because `RequireSession` sends a `no_tenant` session to
 * `/onboarding`, and the resume logic then moves the user forward from step 1
 * once `/auth/me` says how far they got.
 */
export default function OnboardingIndexPage(): never {
  redirect(onboardingStepPath(1));
}
