/**
 * A7 / FRD 00 PLT-X06 §7 — the reminders screen's module tabs.
 *
 * A module with a reminder source (lending, library, gym) registers a tab from
 * its own feature entry: `registerReminderTab('lending', { labelId:
 * 'lending.reminders.tab', order: 10 })`. The screen draws the tab row only
 * when TWO or more tabs exist — the shop's own plus at least one enabled
 * module's — so a plain shop's reminders screen is exactly what it was. The
 * tab's content is core's (`ModuleRemindersPanel`): the module supplies words
 * and a server source, not a screen.
 *
 * Same rules as the other registries (ADR-042): keyed by module, idempotent for
 * an equal entry, a different entry under a used key throws, reset for tests.
 */

export interface ReminderTabEntry {
  /** The module's message id for the tab ("Loans", "Library"). */
  readonly labelId: string;
  /** Lower first; the shop's own tab is always first. */
  readonly order: number;
}

export interface RegisteredReminderTab extends ReminderTabEntry {
  readonly module: string;
}

const registry = new Map<string, RegisteredReminderTab>();

export const registerReminderTab = (module: string, entry: ReminderTabEntry): void => {
  if (!/^[a-z][a-z0-9_]*$/.test(module)) {
    throw new Error(`Reminder tab module "${module}" is not a module code`);
  }
  const existing = registry.get(module);
  if (existing) {
    if (existing.labelId === entry.labelId && existing.order === entry.order) return;
    throw new Error(`Reminder tab "${module}" is registered twice`);
  }
  registry.set(module, { module, ...entry });
};

/** The tabs of the modules in `enabledModules`, in order. */
export const reminderTabsFor = (
  enabledModules: readonly string[]
): readonly RegisteredReminderTab[] =>
  [...registry.values()]
    .filter((tab) => enabledModules.includes(tab.module))
    .sort((a, b) => a.order - b.order || a.module.localeCompare(b.module));

let baseline: ReadonlyMap<string, RegisteredReminderTab> | null = null;

/** Tests only: back to what was registered when first called — never to empty. */
export const resetReminderTabsForTests = (): void => {
  baseline ??= new Map(registry);
  registry.clear();
  baseline.forEach((value, key) => registry.set(key, value));
};
