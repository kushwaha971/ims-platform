import { LENDING_APP } from 'modules/DigiKhaato/features/lending/app';
import { LIBRARY_APP } from 'modules/DigiKhaato/features/library/app';
import type { AppManifest } from 'modules/DigiKhaato/features/navigation/appManifest';
import { SHOP_APP } from 'modules/DigiKhaato/features/shop/app';

/**
 * docs/platform/14 §4.2 — every app's manifest, in one list: the second road
 * core has to a vertical, beside `registrations.ts` (ADR-061), and like it it
 * sits outside `features/` so the core-to-vertical lint zone allows it.
 *
 * A manifest is DATA — icons, routes, message ids — and imports nothing of its
 * app's code, so the shell that reads this list pays for menus, never for a
 * vertical's screens or slices (`src/tests/appManifests.test.ts` holds that).
 *
 * Adding an app is a manifest in its own folder and one line here; the server
 * registers it in its own `AppConfig.ready()`. Order here does not matter: the
 * switcher follows the server's order.
 */
export const APP_MANIFESTS: readonly AppManifest[] = [LIBRARY_APP, LENDING_APP, SHOP_APP];

export const manifestFor = (code: string | null | undefined): AppManifest | undefined =>
  APP_MANIFESTS.find((app) => app.code === code);
