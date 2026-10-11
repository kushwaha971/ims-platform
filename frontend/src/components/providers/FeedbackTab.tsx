'use client';

import { useCallback, useEffect, useState } from 'react';

import { MessageSquare } from 'lucide-react';

import { UbPressable, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import type { PostHog } from 'posthog-js';

/**
 * A "Feedback" tab on the right edge that opens the PostHog survey, as often
 * as somebody wants (owner, 11 Oct 2026).
 *
 * The survey itself is PostHog's: made, worded and read in the PostHog
 * dashboard. But a "Popover" survey shows ONCE — the owner closed his and
 * asked why it could not be opened again — and from then on that browser is
 * never offered it. Feedback is not something people have at the moment a
 * popup decides to ask; it is something they have when a screen annoys them.
 * So the door stays on the page, and pressing it asks PostHog to show that
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
  const { t } = useTranslation();
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

  if (!survey) return null;
  return (
    <UbPressable
      onClick={open}
      aria-label={t('feedback.tab.label')}
      data-testid="feedback-tab"
      // On the right edge, read bottom-to-top like the spine of a book. Under
      // dialogs and the snackbar (z-30), never printed, and out of the way of
      // the phone's bottom bar by sitting at mid-height.
      // `w-auto`: a pressable is full-width by default, and the first version of
      // this tab was a band across the whole screen.
      className="fixed left-auto right-0 top-1/2 z-30 inline-flex w-auto -translate-y-1/2 flex-col items-center gap-2 rounded-l-[10px] bg-accent px-2 py-3 text-text-inverse shadow-[0_8px_24px_-10px_rgb(0_0_0/0.45)] hover:bg-accent-hover print:hidden"
    >
      <MessageSquare aria-hidden className="h-4 w-4 text-text-inverse" />
      <UbText
        as="span"
        variant="inherit"
        className="ds-body-s-semibold rotate-180 text-text-inverse [writing-mode:vertical-rl]"
      >
        {t('feedback.tab')}
      </UbText>
    </UbPressable>
  );
}
