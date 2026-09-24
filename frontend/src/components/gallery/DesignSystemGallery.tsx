'use client';

import { useCallback, useState } from 'react';

import {
  UbAmount,
  UbAvatar,
  UbBox,
  UbButton,
  UbCard,
  UbDivider,
  UbEmptyState,
  UbGrid,
  UbListItemText,
  UbLogo,
  UbPageHeader,
  UbPageShell,
  UbPopover,
  UbPressable,
  UbSkeleton,
  UbSnackbar,
  UbSpacer,
  UbStack,
  UbStatusBadge,
  UbStatusBanner,
  UbSwitch,
  UbText,
  UbTooltip,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { DesignSystemChartsGallery } from './DesignSystemChartsGallery';
import { DesignSystemLineItemsGallery } from './DesignSystemLineItemsGallery';
import { DesignSystemWave1Gallery } from './DesignSystemWave1Gallery';
import { DesignSystemWave3Gallery } from './DesignSystemWave3Gallery';

/**
 * Part 23 §23.4 — the live gallery. Storybook is not a dependency (ADR-021), so
 * this route is where a reviewer sees every `Ub*` wrapper in every state, in
 * both locales and both themes.
 *
 * It is the only place in the application where a `Ub*` is rendered with
 * literal strings rather than translated props, and that is deliberate: the
 * gallery is developer chrome, not product (§23.2.2's `ds-label-caps` rule).
 */
const DEMO_MESSAGE = 'Could not reach the server.';

export function DesignSystemGallery(): React.JSX.Element {
  const { t } = useTranslation();
  // CR-2026-09-19-E — `UbSnackbar` takes ONE message now, not a queue.
  const [message, setMessage] = useState<string | null>(DEMO_MESSAGE);
  const [switchOn, setSwitchOn] = useState(true);
  const onDismiss = useCallback(() => setMessage(null), []);

  return (
    <UbPageShell
      header={
        <UbPageHeader title={t('designSystem.title')} subtitle={t('designSystem.subtitle')} />
      }
    >
      <UbStack gap={6}>
        <UbCard
          title="UbLogo"
          description="§23.2.6 — the mark alone and the full lockup, at every tier. Painted from --brand-*, so a white-label ramp repaints it."
        >
          <UbStack gap={5}>
            <UbStack direction="row" wrap align="center" gap={6}>
              <UbLogo size="sm" />
              <UbLogo size="md" />
              <UbLogo size="lg" />
              <UbLogo size="xl" />
            </UbStack>
            <UbDivider decorative />
            <UbStack direction="row" wrap align="center" gap={8}>
              <UbLogo variant="full" size="sm" />
              <UbLogo variant="full" size="md" />
              <UbLogo variant="full" size="lg" />
            </UbStack>
            <UbDivider decorative />
            {/* `tone="inherit"` is what the dark rail uses: the rail is dark in
                BOTH themes, so the wordmark must not follow --text-primary. */}
            <UbBox className="rounded-card bg-surface-nav p-5 text-text-onNav">
              <UbLogo variant="full" size="md" tone="inherit" />
            </UbBox>
            <UbStack direction="row" wrap align="center" gap={6}>
              <UbLogo variant="full" size="md" wordmark="Bharat Khata" />
              <UbLogo size="md" label="Named, for a link that has no text" />
            </UbStack>
          </UbStack>
        </UbCard>

        <UbCard title="UbAmount" description="Part 23 §23.2.6 — every case in the table.">
          <UbStack direction="row" wrap align="start" gap={8}>
            <UbAmount value="500.00" tone="receivable" sign="minus" label="You gave" />
            <UbAmount value="300.00" tone="payable" sign="plus" label="You got" />
            <UbAmount value="2800.00" tone="receivable" label="You will get" size="lg" />
            <UbAmount value="0.00" tone="receivable" sign="minus" label="Settled" />
            <UbAmount value={null} />
            <UbAmount value="123456.5" tone="payable" label="You will give" size="sm" />
          </UbStack>
        </UbCard>

        <UbCard title="UbStatusBadge">
          <UbStack direction="row" wrap gap={2}>
            <UbStatusBadge label="Draft" tone="info" />
            <UbStatusBadge label="Paid" tone="success" />
            <UbStatusBadge label="Due soon" tone="warning" />
            <UbStatusBadge label="Overdue" tone="error" />
            <UbStatusBadge label="Archived" />
          </UbStack>
        </UbCard>

        <UbCard title="UbStatusBanner">
          <UbStack gap={3}>
            <UbStatusBanner tone="info" title="Draft saved" description="Saved a moment ago." />
            <UbStatusBanner tone="warning" title={t('common.network.degraded')} />
            <UbStatusBanner
              tone="offline"
              title={t('common.network.offline')}
              description={t('common.network.pending', { count: 2 })}
            />
            <UbStatusBanner
              tone="error"
              title="We could not save this"
              description="Check the highlighted fields."
            />
          </UbStack>
        </UbCard>

        <UbCard title="UbEmptyState">
          <UbStack gap={4}>
            <UbEmptyState
              variant="firstUse"
              title={t('parties.list.empty.firstUse.title')}
              description={t('parties.list.empty.firstUse.body')}
            />
            <UbEmptyState
              variant="filtered"
              title={t('parties.list.empty.filtered.title')}
              description={t('parties.list.empty.filtered.body')}
            />
            <UbEmptyState
              variant="error"
              title={t('parties.list.error.title')}
              description={t('parties.list.error.body')}
              requestId="req_7f3a91"
              requestIdLabel={t('common.error.reference')}
            />
          </UbStack>
        </UbCard>

        <UbCard title="UbSkeleton">
          <UbStack gap={4}>
            <UbSkeleton variant="list" count={3} />
            <UbSkeleton variant="card" />
            <UbSkeleton variant="form" count={2} />
          </UbStack>
        </UbCard>

        {/* The three BrandHub components that had no counterpart here at all,
            so the first screen that wants a settings toggle or an explanation
            for a disabled control has something to render. */}
        <UbCard title="UbTooltip" description="White card and arrow, like BrandHub's.">
          <UbStack direction="row" gap={4} align="center">
            <UbTooltip title="Needs signal — this write is online-only.">
              <UbButton variant="secondary">Hover me</UbButton>
            </UbTooltip>
            <UbTooltip title="Below the trigger." placement="bottom">
              <UbButton variant="ghost">Bottom</UbButton>
            </UbTooltip>
            {/* A blank title renders the child bare — the `disabled ? reason : ''`
                call, which is most of what this component is for. */}
            <UbTooltip title="">
              <UbButton variant="outlineNeutral">No tooltip at all</UbButton>
            </UbTooltip>
          </UbStack>
        </UbCard>

        <UbCard title="UbPopover" description="Anchored panel, 300px, its content scrolls.">
          <UbPopover
            label="Demo popover"
            trigger={<UbButton variant="secondary">Open popover</UbButton>}
          >
            <UbStack gap={2} className="p-4">
              <UbText variant="body-medium">Anchored panel</UbText>
              <UbText variant="body-sm" tone="secondary">
                The frame is fixed and the body scrolls, with the page behind it held still —
                `overscroll-contain`.
              </UbText>
            </UbStack>
          </UbPopover>
        </UbCard>

        <UbCard title="UbSwitch" description="33×18 track, 44px target, label inside it.">
          <UbStack gap={2}>
            <UbSwitch
              checked={switchOn}
              onCheckedChange={setSwitchOn}
              label="WhatsApp reminders"
              description="Send a reminder when a khata goes past its due date."
            />
            <UbSwitch checked={false} onCheckedChange={() => undefined} label="Off" />
            <UbSwitch checked disabled onCheckedChange={() => undefined} label="On, disabled" />
          </UbStack>
        </UbCard>

        {/* Part 32 §32.4.4 — wave 1, in its own file so the gallery stays
            readable as waves 2 and 3 land. */}
        <UbText as="h2" variant="h3" className="mt-4">
          Wave 1 — Sprint 1
        </UbText>
        <DesignSystemWave1Gallery />

        <UbText as="h2" variant="h3" className="mt-4">
          Wave 3 — Sprint 3
        </UbText>
        <DesignSystemWave3Gallery />

        <UbText as="h2" variant="h3" className="mt-4">
          Line items — Sprint 4
        </UbText>
        <DesignSystemLineItemsGallery />

        <DesignSystemChartsGallery />

        <UbText as="h2" variant="h3" className="mt-4">
          Wave 2 — layout and typography
        </UbText>

        <UbCard
          title="UbText"
          description="Part 23 §23.2.2 — the tiers. `as` picks the element, `variant` picks the tier."
        >
          <UbStack gap={2}>
            <UbText variant="display">ds-display</UbText>
            <UbText as="h1" variant="h1">
              ds-h1 — on a real &lt;h1&gt;
            </UbText>
            <UbText as="h2" variant="h2">
              ds-h2 — on a real &lt;h2&gt;
            </UbText>
            <UbText variant="body">ds-body — default text</UbText>
            <UbText variant="body-sm" tone="tertiary">
              ds-body-sm — text inside cards and tables
            </UbText>
            <UbText variant="caption" tone="muted">
              ds-caption — metadata
            </UbText>
            <UbText variant="label" tone="tertiary">
              ds-label — the translated label tier (13 px under :lang(hi))
            </UbText>
            <UbText variant="label-caps" tone="tertiary">
              ds-label-caps — Latin only, never a translated string
            </UbText>
            <UbText variant="metric-md" dir="ltr">
              1,23,456.50
            </UbText>
            <UbText variant="mono" tone="muted">
              req_7f3a91
            </UbText>
          </UbStack>
        </UbCard>

        <UbCard title="UbStack · UbGrid · UbDivider · UbSpacer">
          <UbStack gap={4}>
            <UbStack direction="row" align="center" gap={3}>
              <UbText variant="body-sm">row</UbText>
              <UbDivider orientation="vertical" />
              <UbText variant="body-sm">align=center</UbText>
              <UbDivider orientation="vertical" />
              <UbText variant="body-sm">gap=3</UbText>
            </UbStack>
            <UbDivider />
            <UbGrid columns={{ base: 1, sm: 3 }} gap={3}>
              <UbText variant="body-sm">one</UbText>
              <UbText variant="body-sm">two</UbText>
              <UbText variant="body-sm">three</UbText>
            </UbGrid>
            <UbSpacer size={4} />
          </UbStack>
        </UbCard>

        <UbCard
          title="UbAvatar · UbListItemText · UbPressable"
          description="The row shape the party list, the tenant chooser and the switcher all share."
        >
          <UbStack as="ul">
            {[
              { id: 'a', name: 'Sharma General Store', role: 'Owner' },
              { id: 'b', name: 'शर्मा जनरल स्टोर', role: 'Staff' },
            ].map((row) => (
              <UbBox as="li" key={row.id}>
                <UbPressable className="flex min-h-[56px] items-center gap-3 px-1 py-3 hover:bg-surface-hover">
                  <UbAvatar name={row.name} />
                  <UbListItemText primary={row.name} secondary={row.role} />
                </UbPressable>
              </UbBox>
            ))}
          </UbStack>
        </UbCard>
      </UbStack>

      <UbSnackbar
        message={message}
        severity="error"
        requestId="req_7f3a91"
        requestIdLabel={t('common.error.reference')}
        onDismiss={onDismiss}
        dismissLabel={t('common.action.dismiss')}
      />
    </UbPageShell>
  );
}
