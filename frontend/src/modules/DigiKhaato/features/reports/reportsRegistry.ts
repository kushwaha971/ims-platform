/**
 * A10 / FRD 00 PLT-X13 §7 and EC-2 — the client half of the module-report
 * registry.
 *
 * The core reports hub is `constants/reportCatalogue.ts`. A module's reports
 * come from the server's `GET /reports` (module on, codename held) AND from
 * here: a module registers the SCREEN of each report under the same
 * `<module>.<name>` key. The hub lists the intersection only, so a report the
 * server knows and no screen exists for is never a dead link, and a screen the
 * server did not list (module off, codename missing) is never offered.
 *
 * `hasModuleReports()` lets the hub skip the request altogether while no
 * module has registered one — which is every tenant today.
 *
 * Rendering the module rows in the hub is the first vertical's reports task
 * (library B15/F11): with no registered report there is nothing to lay out or
 * to look at, and the grouping beside the core catalogue's groups is better
 * decided against a real one.
 */

export interface ModuleReportEntry {
  readonly module: string;
  /** The route of the report's own screen. */
  readonly href: string;
}

export interface ServerModuleReport {
  readonly key: string;
  readonly module: string;
  readonly labelId: string;
  readonly permission: string;
  readonly hasCsv: boolean;
}

export interface VisibleModuleReport extends ServerModuleReport {
  readonly href: string;
}

const KEY = /^([a-z][a-z0-9_]*)\.[a-z0-9][a-z0-9_]*$/;
const registry = new Map<string, ModuleReportEntry>();

export const registerModuleReport = (key: string, entry: ModuleReportEntry): void => {
  const match = KEY.exec(key);
  if (!match || match[1] !== entry.module) {
    throw new Error(`Report "${key}" must be "<module>.<name>" of ${entry.module}`);
  }
  const existing = registry.get(key);
  if (existing) {
    if (existing.module === entry.module && existing.href === entry.href) return;
    throw new Error(`Report "${key}" is registered twice`);
  }
  registry.set(key, entry);
};

export const hasModuleReports = (): boolean => registry.size > 0;

/** EC-2: the server's list, kept only where a module registered the screen. */
export const visibleModuleReports = (
  server: readonly ServerModuleReport[]
): readonly VisibleModuleReport[] =>
  server.flatMap((report) => {
    const entry = registry.get(report.key);
    return entry && entry.module === report.module ? [{ ...report, href: entry.href }] : [];
  });

let baseline: ReadonlyMap<string, ModuleReportEntry> | null = null;

/** Tests only: back to what was registered when first called, never to empty. */
export const resetModuleReportsForTests = (): void => {
  baseline ??= new Map(registry);
  registry.clear();
  baseline.forEach((value, key) => registry.set(key, value));
};
