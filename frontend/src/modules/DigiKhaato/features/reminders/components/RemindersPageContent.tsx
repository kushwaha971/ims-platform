'use client';

import { useCallback, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { MessageCircle, Settings2 } from 'lucide-react';

import {
  UbBox,
  UbButton,
  UbChoiceChips,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbStack,
  UbStatusBanner,
  UbTabs,
  UbText,
} from 'src/design-system';
import {
  UbDataGrid,
  useGridTier,
  type UbDataGridEmptyStates,
  type UbDataGridLabels,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectEnabledModules } from 'src/redux/slice/sessionSlice';
import { partyPath } from 'src/routes';
import { formatInr } from 'src/utils/money';

import { usePartyReminder } from 'modules/DigiKhaato/features/ledger/hooks/usePartyReminder';

import { useReminders } from '../hooks/useReminders';
import { reminderTabsFor } from '../moduleTabs';
import { startBulkReminders } from '../redux/reminderThunk';
import { reminderTabLabel } from '../view-model/moduleReminderDisplay';
import { REMINDER_TABS, bucketFigure, isBucket } from '../view-model/reminderDisplay';

import { createDueColumns, createHistoryColumns } from './ReminderColumns';

import type { DueParty, Reminder, ReminderKindFilter, ReminderTab } from '../types/reminder.types';

/* Each of these opens from a tap, so each belongs in the chunk that opens it
   (the rule CLAUDE.md records three times): a merchant who opens the screen to
   see who is due today downloads none of them. */
const PartyReminderSheetLazy = /* @__PURE__ */ dynamic(() =>
  import('./PartyReminderSheet').then((m) => m.PartyReminderSheet)
);
const BulkReminderDialogLazy = /* @__PURE__ */ dynamic(() =>
  import('./BulkReminderDialog').then((m) => m.BulkReminderDialog)
);
const ReminderSettingsDialogLazy = /* @__PURE__ */ dynamic(() =>
  import('./ReminderSettingsDialog').then((m) => m.ReminderSettingsDialog)
);
// A7 — a module's tab, in its own chunk: a shop never downloads it.
const ModuleRemindersPanelLazy = /* @__PURE__ */ dynamic(() =>
  import('./ModuleRemindersPanel').then((m) => m.ModuleRemindersPanel)
);

const SHOP_SCOPE = 'shop';

const HISTORY_FILTERS: readonly ReminderKindFilter[] = ['', 'auto', 'manual', 'failed'];
const FILTER_LABEL: Readonly<Record<ReminderKindFilter, string>> = {
  '': 'reminders.filter.all',
  auto: 'reminders.filter.auto',
  manual: 'reminders.filter.manual',
  failed: 'reminders.filter.failed',
};

/**
 * LED-05 / LED-06 / LED-07 — `/ledger/reminders`: who to chase today.
 *
 * ── The tabs are the buckets ─────────────────────────────────────────────
 * Due today, Overdue and Upcoming are LED-05's three buckets with their counts
 * on the tab, over the same `balance > 0` predicate the server counts with, so
 * the number on a tab is the number of rows under it. Sent is the history —
 * every manual and automated reminder, filterable to what failed.
 *
 * ── Remind is one tap, "Remind all" is one tap per customer ──────────────
 * A single reminder is the khata's sheet, with the server's text. Bulk is the
 * sequential flow in `BulkReminderDialog`: a browser opens one window per tap,
 * so forty reminders are forty taps, each on a real link.
 */
export function RemindersPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const tier = useGridTier();
  const r = useReminders();
  /* A7 — module tabs, from the registry, for the modules that are on. */
  const enabledModules = useAppSelector(selectEnabledModules);
  const moduleTabs = useMemo(() => reminderTabsFor(enabledModules), [enabledModules]);
  const [scope, setScope] = useState<string>(SHOP_SCOPE);
  const scopeTabs = useMemo(
    () => [
      { value: SHOP_SCOPE, label: t('reminders.module.shopTab') },
      ...moduleTabs.map((tab) => ({
        value: tab.module,
        label: reminderTabLabel(t, tab.module, tab.labelId),
      })),
    ],
    [moduleTabs, t]
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [target, setTarget] = useState<DueParty | null>(null);

  const reminder = usePartyReminder(
    target
      ? {
          id: target.id,
          name: target.name,
          balance: target.balance,
          mobile: target.mobile,
          isArchived: false,
        }
      : null
  );
  const { openSheet } = reminder;
  const onRemind = useCallback(
    (row: DueParty) => {
      setTarget(row);
      openSheet();
    },
    [openSheet]
  );

  const { canRemind, setSelected, selected } = r;
  const startBulk = useCallback(
    (partyIds: readonly string[]) => {
      if (partyIds.length === 0) return;
      setBulkOpen(true);
      void dispatch(startBulkReminders({ partyIds, channel: 'whatsapp_manual' }));
    },
    [dispatch]
  );
  const closeBulk = useCallback(() => {
    setBulkOpen(false);
    setSelected([]);
  }, [setSelected]);

  const dueColumns = useMemo(
    () => createDueColumns({ t, today: r.today, tier, canRemind, onRemind }),
    [t, r.today, tier, canRemind, onRemind]
  );
  const historyColumns = useMemo(() => createHistoryColumns({ t, tier }), [t, tier]);

  const labels = useMemo<UbDataGridLabels>(
    () => ({
      loading: t('reminders.loading'),
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      selectedCount: t('common.grid.selectedCount', { count: selected.length }),
      selectAll: t('reminders.select.all'),
      selectRow: t('reminders.select.row', { name: '{name}' }),
      showing: t('common.grid.showing'),
      columns: t('common.grid.columns'),
      showAllColumns: t('common.grid.showAllColumns'),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: canRemind
        ? t('reminders.remindParty', { name: '{name}' })
        : t('reminders.openParty', { name: '{name}' }),
    }),
    [t, selected.length, canRemind]
  );

  const { refetch, tab, setTab, due, history, setHistoryFilter, summary, settings } = r;
  const errorShape = isBucket(tab) ? due.error : history.error;
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t(`reminders.empty.${tab}.title`),
        description: t(`reminders.empty.${tab}.body`),
      },
      filtered: {
        title: t('reminders.empty.filtered.title'),
        description: t('reminders.empty.filtered.body'),
        action: (
          <UbButton variant="secondary" onClick={() => setHistoryFilter('')}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('reminders.error.title'),
        description: errorShape?.message ?? t('reminders.error.body'),
        requestId: errorShape?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, tab, errorShape, refetch, setHistoryFilter]
  );

  const tabs = useMemo(
    () =>
      REMINDER_TABS.map((value) => {
        const figure = isBucket(value) ? bucketFigure(summary, value) : null;
        return {
          value,
          label: (
            <UbBox as="span" className="inline-flex items-baseline gap-2">
              {/* QA at 360–390 px: four full labels with counts outran the
                  row and "Sent" / "भेजे गए" scrolled out of sight. A phone
                  SHOWS the short form, but the full label stays the tab's
                  accessible name at every width (visually hidden, not
                  removed), and the short one is hidden from assistive tech. */}
              <UbText as="span" variant="inherit" tone="inherit" className="max-sm:sr-only">
                {t(`reminders.tab.${value}`)}
              </UbText>
              <UbText as="span" variant="inherit" tone="inherit" className="sm:hidden" aria-hidden>
                {t(`reminders.tabShort.${value}`)}
              </UbText>
              {figure && (
                <UbText as="span" variant="inherit" tone="inherit" className="ds-num-base-semibold">
                  {figure.count}
                </UbText>
              )}
            </UbBox>
          ),
        };
      }),
    [t, summary]
  );

  const handleCardOpen = useCallback(
    (row: DueParty) => (canRemind ? onRemind(row) : router.push(partyPath(row.id))),
    [canRemind, onRemind, router]
  );
  const handleHistoryOpen = useCallback(
    (row: Reminder) => router.push(partyPath(row.partyId)),
    [router]
  );
  const dueId = useCallback((row: DueParty) => row.id, []);
  const dueName = useCallback((row: DueParty) => row.name, []);
  const historyId = useCallback((row: Reminder) => row.id, []);
  const historyName = useCallback((row: Reminder) => row.partyName, []);

  if (!r.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('reminders.noAccess.title')}
          description={t('reminders.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  const figure = isBucket(tab) ? bucketFigure(summary, tab) : null;
  const pageIds = due.rows.map((row) => row.id);

  const dueState: UbGridState =
    due.status === 'failed'
      ? 'error'
      : (due.status === 'loading' || due.status === 'idle') && due.rows.length === 0
        ? 'loading'
        : due.rows.length === 0
          ? 'empty'
          : 'rows';
  const historyState: UbGridState =
    history.status === 'failed'
      ? 'error'
      : (history.status === 'loading' || history.status === 'idle') && history.rows.length === 0
        ? 'loading'
        : history.rows.length === 0
          ? history.filter
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  const shopTabs = (
    <UbTabs<ReminderTab>
      value={tab}
      onValueChange={setTab}
      tabs={tabs}
      ariaLabel={t('reminders.tabs')}
      layout="fit"
    >
      {isBucket(tab) ? (
        <UbStack gap={3}>
          <UbStack direction="row" justify="between" align="center" gap={2} wrap>
            <UbText variant="body-sm" tone="secondary" data-testid="bucket-caption">
              {figure
                ? t('reminders.bucket.caption', {
                    amount: formatInr(figure.amount),
                    count: figure.count,
                  })
                : ' '}
            </UbText>
            {canRemind && due.rows.length > 0 && (
              <UbButton
                variant="outlineNeutral"
                size="sm"
                icon={<MessageCircle aria-hidden className="h-4 w-4" />}
                onClick={() => startBulk(pageIds)}
              >
                {t('reminders.bulk.page')}
              </UbButton>
            )}
          </UbStack>
          <UbDataGrid
            rows={due.rows}
            columns={dueColumns}
            rowId={dueId}
            rowName={dueName}
            state={dueState}
            labels={labels}
            emptyStates={emptyStates}
            caption={t(`reminders.caption.${tab}`)}
            storageId="ledger.reminders.due"
            page={{
              page: due.page,
              pageSize: due.pageSize,
              total: due.total,
              totalPages: Math.max(Math.ceil(due.total / Math.max(due.pageSize, 1)), 1),
            }}
            onPageChange={r.setPage}
            selectable={canRemind}
            selectedIds={selected}
            onSelectionChange={setSelected}
            bulkActions={
              <UbButton
                variant="primary"
                size="sm"
                icon={<MessageCircle aria-hidden className="h-4 w-4" />}
                onClick={() => startBulk(selected)}
              >
                {t('reminders.bulk.selected', { count: selected.length })}
              </UbButton>
            }
            onRowOpen={tier === 'cards' ? handleCardOpen : undefined}
          />
        </UbStack>
      ) : (
        <UbStack gap={3}>
          <UbChoiceChips<ReminderKindFilter>
            value={history.filter}
            onChange={setHistoryFilter}
            ariaLabel={t('reminders.filter.label')}
            options={HISTORY_FILTERS.map((value) => ({ value, label: t(FILTER_LABEL[value]) }))}
          />
          <UbDataGrid
            rows={history.rows}
            columns={historyColumns}
            rowId={historyId}
            rowName={historyName}
            state={historyState}
            labels={labels}
            emptyStates={emptyStates}
            caption={t('reminders.caption.sent')}
            storageId="ledger.reminders.sent"
            page={{
              page: history.page,
              pageSize: history.pageSize,
              total: history.total,
              totalPages: Math.max(Math.ceil(history.total / Math.max(history.pageSize, 1)), 1),
            }}
            onPageChange={r.setPage}
            onRowOpen={tier === 'cards' ? handleHistoryOpen : undefined}
          />
        </UbStack>
      )}
    </UbTabs>
  );

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('reminders.title')}
        actions={
          r.canManageSettings ? (
            <UbButton
              variant="outlineNeutral"
              size="sm"
              iconOnly
              icon={<Settings2 aria-hidden className="h-4 w-4" />}
              onClick={() => setSettingsOpen(true)}
            >
              {t('reminders.settings.open')}
            </UbButton>
          ) : undefined
        }
      />

      <UbStack gap={4} data-testid="reminders-screen">
        {/* LED-07 §9 — the switch is on and nothing can leave. Said on the
            screen where the merchant would otherwise wonder why no SMS went. */}
        {settings?.autoSms && !settings.smsConfigured && (
          <UbStatusBanner
            tone="warning"
            title={t('reminders.banner.noProvider.title')}
            description={t('reminders.banner.noProvider.body')}
          />
        )}

        {moduleTabs.length > 0 ? (
          /* A7 (PLT-X06 §7) — "Shop" plus each enabled module with a reminder
             source. Only with a second tab: a plain shop's screen is unchanged. */
          <UbTabs<string>
            value={scope}
            onValueChange={setScope}
            tabs={scopeTabs}
            ariaLabel={t('reminders.module.tabs')}
            layout="fit"
          >
            {scope === SHOP_SCOPE ? shopTabs : <ModuleRemindersPanelLazy module={scope} />}
          </UbTabs>
        ) : (
          shopTabs
        )}
      </UbStack>

      {reminder.canRemind && reminder.open && (
        <PartyReminderSheetLazy
          partyId={reminder.partyId}
          open={reminder.open}
          onOpenChange={reminder.setOpen}
          title={reminder.title}
          description={reminder.description}
          phone={reminder.phone}
          labels={reminder.labels}
        />
      )}
      {bulkOpen && <BulkReminderDialogLazy open={bulkOpen} onClose={closeBulk} />}
      {settingsOpen && (
        <ReminderSettingsDialogLazy open={settingsOpen} onOpenChange={setSettingsOpen} />
      )}
    </UbPageShell>
  );
}
