'use client';

import { useCallback, useEffect, useState } from 'react';

import { registerFeedback } from 'src/analytics/feedback';

import type { PostHog } from 'posthog-js';

/**
 * Makes the survey available in account navigation, as often as somebody
 * wants (owner, 11 Oct 2026; QA B16 moved it off the right edge of forms).
 *
 * The survey itself is PostHog's: made, worded and read in the PostHog
 * dashboard. But a "Popover" survey shows ONCE — the owner closed his and
 * asked why it could not be opened again — and from then on that browser is
 * never offered it. Feedback is not something people have at the moment a
 * popup decides to ask; it is something they have when a screen annoys them.
 * So the door stays in the account menu, and pressing it asks PostHog to show that
 * same survey again, ignoring "already seen".
 *
 * It draws nothing when there is nothing to open: no launched survey, or a
 * survey of PostHog's own "Feedback button" kind, which brings a tab of its
 * own and would make two.
 */
interface OpenableSurvey {
  readonly id: string;
}

const pickSurvey = (
  surveys: readonly { id: string; type?: string; end_date?: string | null }[]
): OpenableSurvey | null => {
  // A survey that is running. PostHog's widget kind draws its own tab.
  if (surveys.some((survey) => survey.type === 'widget' && !survey.end_date)) return null;
  const popover = surveys.find((survey) => survey.type === 'popover' && !survey.end_date);
  return popover ? { id: popover.id } : null;
};

export function FeedbackTab({ posthog }: Readonly<{ posthog: PostHog }>): React.JSX.Element | null {
  const [survey, setSurvey] = useState<OpenableSurvey | null>(null);

  useEffect(() => {
    let live = true;
    posthog.getSurveys((surveys) => {
      if (live) setSurvey(pickSurvey(surveys));
    });
    return () => {
      live = false;
    };
  }, [posthog]);

  const open = useCallback(() => {
    if (!survey) return;
    // The same survey, shown again on request: "already seen" and the popup
    // delay are the popup's rules, not the rules of somebody who asked for it.
    posthog.displaySurvey(survey.id, {
      displayType: 'popover',
      ignoreConditions: true,
      ignoreDelay: true,
    } as Parameters<PostHog['displaySurvey']>[1]);
  }, [posthog, survey]);

  useEffect(() => (survey ? registerFeedback(open) : undefined), [open, survey]);
  return null;
}
