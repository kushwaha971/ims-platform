'use client';

import { Circle, CircleCheck } from 'lucide-react';

import { UbActionLink, UbButton, UbCard, UbDivider, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { useAppSetup } from '../hooks/useAppSetup';

import 'src/i18n/catalogues/appSetup';

/**
 * docs/platform/14 step 5 — an app's setup checklist, at the top of its home.
 *
 * It NEVER blocks: every page of the app works whether or not a step is done,
 * and the card is gone once every step is done, or once the owner or an admin
 * hides it for the business. Each undone step is a link to the page that does
 * it; a done one is struck through, so the list reads as progress. A person is
 * shown only the steps they could do, so staff are not told to lay out seats.
 *
 * The Shop's equivalent is the dashboard's own first-use list (RPT-01 FR-9),
 * which replaces its ₹0 tiles in an empty book; this card is for every other
 * app, and for any app registered later, with no code of its own.
 */
export function AppSetupCard({
  app,
  appName,
}: Readonly<{ app: string; appName: string }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const { setup, hiding, hide } = useAppSetup(app);

  if (!setup || setup.hidden || setup.complete || setup.steps.length === 0) return null;
  const done = setup.steps.filter((step) => step.done).length;

  return (
    <UbCard
      padded
      title={t('appSetup.title', { app: appName })}
      description={t('appSetup.progress', { done, total: setup.steps.length })}
      action={
        setup.canHide ? (
          <UbButton variant="ghost" size="sm" onClick={hide} busy={hiding}>
            {t('appSetup.hide')}
          </UbButton>
        ) : undefined
      }
    >
      {/* Owner, 12 Oct 2026, on the old card of small underlined links: the
          same rows as the Shop's first day — the step in plain words and a
          Start button for each step not yet done. */}
      <UbStack as="ol" gap={0} aria-label={t('appSetup.title', { app: appName })}>
        {setup.steps.map((step, index) => (
          <UbStack as="li" key={step.key} gap={0}>
            {index > 0 && <UbDivider />}
            <UbStack direction="row" align="center" className="gap-3 py-3">
              {step.done ? (
                <CircleCheck className="h-5 w-5 shrink-0 text-success" aria-hidden />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-text-tertiary" aria-hidden />
              )}
              <UbText
                as="span"
                variant="body-medium"
                tone={step.done ? 'tertiary' : undefined}
                className={`min-w-0 flex-1 ${step.done ? 'line-through' : ''}`}
              >
                {t(step.labelId)}
              </UbText>
              {!step.done && (
                <UbActionLink
                  href={step.path}
                  variant="secondary"
                  size="sm"
                  aria-label={t('appSetup.startStep', { step: t(step.labelId) })}
                >
                  {t('appSetup.start')}
                </UbActionLink>
              )}
            </UbStack>
          </UbStack>
        ))}
      </UbStack>
    </UbCard>
  );
}
