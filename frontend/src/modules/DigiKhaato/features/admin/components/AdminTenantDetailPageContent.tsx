'use client';

import { useCallback, useState } from 'react';

import dynamic from 'next/dynamic';

import { ArrowLeft, DoorOpen, KeyRound, Pencil } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbEmptyState,
  UbInfoRow,
  UbPageHeader,
  UbPageShell,
  UbPanel,
  UbPanelSection,
  UbProgress,
  UbSkeleton,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate, formatTimestamp } from 'src/utils/dates';

import { supportBadge } from 'modules/DigiKhaato/features/account-data/view-model/accountDataDisplay';

import { useAdminTenantDetail } from '../hooks/useAdmin';
import { limitText, supportAction, tenantStatusTone } from '../view-model/adminDisplay';

import type { AdminTenantDetail } from '../types/admin.types';

const TenantEditDialog = dynamic(
  () => import('./TenantEditDialog').then((module) => module.TenantEditDialog),
  { ssr: false }
);
const AdminReasonDialog = dynamic(
  () => import('./AdminReasonDialog').then((module) => module.AdminReasonDialog),
  { ssr: false }
);

type Dialog = 'edit' | 'request' | 'enter' | null;

function ProfilePanel({ tenant }: Readonly<{ tenant: AdminTenantDetail }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <UbPanel as="section">
      <UbPanelSection title={t('admin.detail.profile')}>
        <UbStack gap={1}>
          <UbInfoRow
            label={t('admin.tenants.column.status')}
            value={
              <UbStatusBadge
                label={t(`admin.status.${tenant.status}`)}
                tone={tenantStatusTone(tenant.status)}
              />
            }
          />
          <UbInfoRow
            label={t('admin.detail.owners')}
            value={tenant.owners.map((owner) => `${owner.name} · ${owner.email}`).join(', ') || '—'}
          />
          <UbInfoRow label={t('admin.detail.gstin')} value={tenant.gstin ?? '—'} />
          <UbInfoRow label={t('admin.detail.partner')} value={tenant.partner.name} />
          <UbInfoRow
            label={t('admin.detail.created')}
            value={formatBusinessDate(tenant.createdAt)}
          />
          <UbInfoRow
            label={t('admin.tenants.column.activity')}
            value={formatBusinessDate(tenant.lastActivityAt)}
          />
          {tenant.deletionRequestedAt ? (
            <UbInfoRow
              label={t('admin.detail.deletionRequested')}
              value={formatBusinessDate(tenant.deletionRequestedAt)}
            />
          ) : null}
        </UbStack>
      </UbPanelSection>
    </UbPanel>
  );
}

function PlanPanel({ tenant }: Readonly<{ tenant: AdminTenantDetail }>): React.JSX.Element {
  const { t } = useTranslation();
  const unlimited = t('admin.detail.unlimited');
  return (
    <UbPanel as="section">
      <UbPanelSection title={t('admin.detail.plan', { plan: tenant.plan.name })}>
        <UbStack gap={3}>
          <UbStack gap={1}>
            <UbText variant="body-sm">
              {t('admin.detail.members', {
                used: tenant.maxUsers.used,
                limit: limitText(tenant.maxUsers.limit, unlimited),
              })}
            </UbText>
            <UbProgress
              used={tenant.maxUsers.used}
              limit={tenant.maxUsers.limit}
              ariaLabel={t('admin.detail.membersBar')}
            />
          </UbStack>
          <UbInfoRow
            label={t('admin.edit.maxUsers')}
            value={limitText(tenant.overrides.maxUsers, t('admin.detail.noOverride'))}
          />
          <UbInfoRow
            label={t('admin.edit.storageMb')}
            value={limitText(tenant.overrides.storageMb, t('admin.detail.noOverride'))}
          />
          <UbInfoRow
            label={t('admin.detail.modules')}
            value={tenant.enabledModules.join(', ') || '—'}
          />
        </UbStack>
      </UbPanelSection>
    </UbPanel>
  );
}

function ActivityPanel({ tenant }: Readonly<{ tenant: AdminTenantDetail }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <UbPanel as="section">
      <UbPanelSection title={t('admin.detail.activity')}>
        {tenant.recentAudit.length === 0 ? (
          <UbText variant="caption" tone="tertiary">
            {t('admin.detail.activity.empty')}
          </UbText>
        ) : (
          <UbStack as="ul" gap={0}>
            {tenant.recentAudit.map((line) => (
              <UbStack
                as="li"
                key={line.id}
                gap={0.5}
                className="border-b border-border-subtle py-2 last:border-0"
              >
                <UbText as="span" variant="body-sm-medium" className="break-all">
                  {line.action}
                </UbText>
                <UbText as="span" variant="caption" tone="tertiary">
                  {t('admin.detail.activity.line', {
                    who:
                      line.actorName ??
                      t(`admin.actor.${line.actorType === 'super_admin' ? 'support' : 'system'}`),
                    when: formatTimestamp(line.createdAt),
                  })}
                </UbText>
                {line.reason ? (
                  <UbText as="span" variant="caption" tone="secondary">
                    {line.reason}
                  </UbText>
                ) : null}
              </UbStack>
            ))}
          </UbStack>
        )}
      </UbPanelSection>
    </UbPanel>
  );
}

/**
 * PLT-14 FR-3/FR-5/FR-6 — one business: its profile, plan and limits, the
 * owner's consent state, and the last fifteen things that happened to it.
 * Entering it needs an owner's recorded yes; the button says which step the
 * operator is on (ask → waiting → enter) and never offers a step that would fail.
 */
export function AdminTenantDetailPageContent({ id }: Readonly<{ id: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const detail = useAdminTenantDetail(id);
  const { state } = detail;
  const tenant = state.detail;
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = useCallback(() => setDialog(null), []);

  const submitRequest = useCallback(
    async (reason: string) => {
      const ok = await detail.requestAccess(reason);
      if (ok) close();
      return ok;
    },
    [detail, close]
  );
  const submitEnter = useCallback(
    async (reason: string) => {
      const consent = state.detail?.supportAccess;
      if (consent) await detail.enter(consent.id, reason);
    },
    [detail, state.detail]
  );

  const action = supportAction(tenant?.supportAccess ?? null);
  const back = (
    <UbActionLink
      href={ROUTES.ADMIN_TENANTS}
      variant="ghost"
      iconOnly="mobile"
      icon={<ArrowLeft aria-hidden className="h-4 w-4" />}
    >
      {t('admin.detail.back')}
    </UbActionLink>
  );

  let body: React.ReactNode;
  if (state.detailStatus === 'failed') {
    body = (
      <UbEmptyState
        variant="error"
        title={t('admin.error.title')}
        description={state.detailError?.message ?? t('admin.error.body')}
        requestId={state.detailError?.requestId ?? null}
        requestIdLabel={t('common.error.reference')}
        action={
          <UbButton variant="secondary" onClick={detail.refetch}>
            {t('common.action.retry')}
          </UbButton>
        }
      />
    );
  } else if (!tenant) {
    body = <UbSkeleton variant="form" count={4} />;
  } else {
    const access = tenant.supportAccess;
    const badge = access ? supportBadge(access.status) : null;
    body = (
      <UbStack gap={4}>
        <UbPanel as="section">
          <UbPanelSection
            title={t('admin.detail.support')}
            badge={
              badge && access ? (
                <UbStatusBadge label={t(badge.labelId)} tone={badge.tone} />
              ) : undefined
            }
          >
            <UbText variant="body-sm" tone="secondary">
              {access
                ? t('admin.detail.support.line', {
                    reason: access.reason,
                    until: formatTimestamp(access.expiresAt),
                  })
                : t('admin.detail.support.none')}
            </UbText>
          </UbPanelSection>
        </UbPanel>
        <ProfilePanel tenant={tenant} />
        <PlanPanel tenant={tenant} />
        <ActivityPanel tenant={tenant} />
      </UbStack>
    );
  }

  const actions = tenant ? (
    <>
      {back}
      <UbButton
        variant="secondary"
        iconOnly="mobile"
        icon={<Pencil aria-hidden className="h-4 w-4" />}
        onClick={() => setDialog('edit')}
      >
        {t('admin.detail.edit')}
      </UbButton>
      {action === 'enter' ? (
        <UbButton
          iconOnly="mobile"
          icon={<DoorOpen aria-hidden className="h-4 w-4" />}
          onClick={() => setDialog('enter')}
        >
          {t('admin.detail.enter')}
        </UbButton>
      ) : (
        <UbButton
          iconOnly="mobile"
          icon={<KeyRound aria-hidden className="h-4 w-4" />}
          disabled={action === 'waiting' || tenant.status === 'deleted'}
          onClick={() => setDialog('request')}
        >
          {action === 'waiting' ? t('admin.detail.waiting') : t('admin.detail.request')}
        </UbButton>
      )}
    </>
  ) : (
    back
  );

  return (
    <UbPageShell
      header={
        <UbPageHeader
          title={tenant?.name ?? t('admin.detail.loading')}
          subtitle={tenant ? `${tenant.partner.name} · ${tenant.plan.name}` : undefined}
          actions={actions}
        />
      }
      width="measure"
    >
      {body}
      {tenant && dialog === 'edit' ? (
        <TenantEditDialog
          open
          tenant={tenant}
          plans={state.plans}
          busy={state.saveStatus === 'loading'}
          onSave={detail.save}
          onClose={close}
        />
      ) : null}
      {tenant && dialog === 'request' ? (
        <AdminReasonDialog
          open
          title={t('admin.access.title', { name: tenant.name })}
          description={t('admin.access.body')}
          confirmLabel={t('admin.access.confirm')}
          busy={state.accessStatus === 'loading'}
          onSubmit={submitRequest}
          onClose={close}
        />
      ) : null}
      {tenant && dialog === 'enter' ? (
        <AdminReasonDialog
          open
          title={t('admin.enter.title', { name: tenant.name })}
          description={t('admin.enter.body')}
          confirmLabel={t('admin.enter.confirm')}
          busy={state.enterStatus === 'loading'}
          onSubmit={submitEnter}
          onClose={close}
        />
      ) : null}
    </UbPageShell>
  );
}
