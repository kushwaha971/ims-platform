'use client';

import { useMemo } from 'react';

import { Gauge } from 'lucide-react';

import { UbButton, UbDialog, UbProgress, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { usePlanLimits } from '../hooks/usePlanLimits';
import { nounIdFor, planContactAction } from '../view-model/planDisplay';

/**
 * PLT-15 FR-6 — THE plan-limit surface, mounted once in the app shell and
 * opened by the transport layer from any module's 403.
 *
 * What it must do, and does:
 *  - name the number: "You have used 3 of 3 team members on the Free plan";
 *  - give ONE action that changes something — WhatsApp, a phone call or an
 *    email to the partner, prefilled with the business and the limit, because
 *    a support desk that has to ask two questions first is a support desk the
 *    merchant gives up on;
 *  - **keep the originating form's data**. It does this by not touching it:
 *    the dialog is mounted beside the form, not in place of it, and closing it
 *    returns focus to whatever opened it (the `MLDialog` focus restore).
 *
 * §9 "Failed" — a partner with no support contact at all gets "Contact your
 * provider" and no dead link, rather than a `tel:null`.
 *
 * DEC-001 — this dialog can appear for `max_users` (the member limit) and for
 * `storage_mb` (still enforced on uploads). It cannot appear for the ledger,
 * for parties or for invoices, because those are not capped on any MVP plan.
 */
export function PlanLimitDialog(): React.JSX.Element | null {
  const { t } = useTranslation();
  const plan = usePlanLimits();
  const hit = plan.lastHit;

  const contact = useMemo(() => {
    if (!hit) return null;
    const partner = hit.supportContact.name ?? plan.supportContact.name ?? '';
    return planContactAction(
      // The 403's own contact block wins; the cached one is the fallback for a
      // backend that sends the code without the details.
      {
        phone: hit.supportContact.phone ?? plan.supportContact.phone,
        whatsapp: hit.supportContact.whatsapp ?? plan.supportContact.whatsapp,
        email: hit.supportContact.email ?? plan.supportContact.email,
        name: partner || null,
      },
      t('plan.limit.contactText', {
        plan: hit.planCode ?? plan.planCode ?? '',
        noun: t(nounIdFor(hit.limitKey)),
      })
    );
  }, [hit, plan.supportContact, plan.planCode, t]);

  if (!hit) return null;

  const partnerName = hit.supportContact.name ?? plan.supportContact.name;
  const noun = t(nounIdFor(hit.limitKey));

  return (
    <UbDialog
      open={plan.dialogOpen}
      onOpenChange={plan.closeDialog}
      title={t('plan.limit.title')}
      description={
        hit.used !== null && hit.limit !== null
          ? t('plan.limit.body', {
              used: hit.used,
              limit: hit.limit,
              noun,
              plan: hit.planCode ?? plan.planCode ?? '',
            })
          : hit.message
      }
      closeLabel={t('common.action.dismiss')}
      icon={<Gauge aria-hidden className="h-5 w-5 text-warning" />}
      footer={
        <>
          <UbButton variant="secondary" onClick={plan.closeDialog}>
            {t('common.action.close')}
          </UbButton>
          {contact ? (
            <UbButton
              variant="primary"
              onClick={() => {
                window.open(contact.href, '_blank', 'noopener,noreferrer');
              }}
            >
              {t('plan.limit.contact', { partner: partnerName ?? t('plan.limit.provider') })}
            </UbButton>
          ) : (
            <UbButton variant="secondary" disabled>
              {t('plan.limit.noContact')}
            </UbButton>
          )}
        </>
      }
    >
      {hit.used !== null && hit.limit !== null && (
        <UbStack gap={2}>
          <UbText variant="metric-sm" dir="ltr">
            {hit.used} / {hit.limit}
          </UbText>
          <UbProgress used={hit.used} limit={hit.limit} ariaLabel={noun} />
        </UbStack>
      )}

      {/* The product's own promise, restated exactly where a merchant is most
          likely to fear otherwise (DEC-001, PLT-15 §1). */}
      <UbText variant="caption" tone="tertiary">
        {t('plan.ledgerNote')}
      </UbText>

      {/* R-E-4 — the one thing that connects this screen to a backend log line. */}
      {hit.requestId && (
        <UbText variant="mono" tone="muted" data-testid="request-id">
          {hit.requestId}
        </UbText>
      )}
    </UbDialog>
  );
}
