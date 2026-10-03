/**
 * ADR-061 — THE one place core reaches a vertical: each vertical's
 * `register.ts`, imported for its side effect.
 *
 * Imported only by the registry READERS (`PartyModulePanels`,
 * `DashboardModuleSections`, `RemindersPageContent`, `ReminderSettingsDialog`;
 * the reports hub once the first module report registers) — never by a layout
 * or `AppProviders`, so `/login` pays nothing for any vertical. Listed in
 * `package.json` `sideEffects`, as is the `register.ts` glob; it sits outside
 * `features/`, so the core-to-vertical lint zone does not target it, which is
 * the one sanctioned hole. `src/tests/verticalRegistrations.test.ts` fails for
 * any other importer of a `register.ts`, and for a vertical missing here.
 *
 * Released or not, a vertical is listed: the readers filter by
 * `enabled_modules`, which never contains an unreleased module.
 */
import 'modules/DigiKhaato/features/library/register';
