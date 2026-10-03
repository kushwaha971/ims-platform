/**
 * ADR-061 — the library's registrations into core's registries (party panel,
 * dashboard section, reminder tab, module reports), and the only file that
 * makes them. Imported, bare, by `src/modules/registrations.ts` and by
 * nothing else (`src/tests/verticalRegistrations.test.ts`).
 *
 * Data and `dynamic()` references only — never a slice, thunk, schema or
 * service — and no message ids (the ADR's amendment): this file reaches the
 * khata, dashboard and reminders routes, and a literal id here would pull the
 * whole library catalogue onto them. Empty in F01: F04 adds the party panel,
 * F08 the reminder tab, F10 the dashboard section, F11 the reports.
 */
export {};
