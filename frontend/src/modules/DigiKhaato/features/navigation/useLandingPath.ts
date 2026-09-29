'use client';

import { landingPath } from './landing';
import { useNavigation } from './useNavigation';

/** R49 / A16 — the post-sign-in landing for the member signed in now (see `landing.ts`). */
export const useLandingPath = (): string => landingPath(useNavigation().sections);
