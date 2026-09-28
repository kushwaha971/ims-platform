import type { Locale } from 'src/types/domain.types';

/**
 * Part 19 §19.11.2, extended by W4-P (28 Sep 2026) — route-local message
 * catalogues, for every feature rather than two.
 *
 * `locales/en.json` is the SHELL catalogue: the words the app chrome, the auth
 * screens, the snackbar and the design system render, imported statically by
 * the provider every route mounts. Each feature's words live in
 * `locales/catalogues/<name>.{en,hi}.json` and are loaded with the chunk of the
 * screen that renders them: the route imports `src/i18n/catalogues/<name>`,
 * and that module registers its catalogue HERE the moment it is evaluated —
 * which is when the route's chunk loads, before anything in it renders.
 *
 * ── One live message map per locale, not a provider per route ──────────────
 * Registration writes the new keys INTO the map the shell's `IntlProvider`
 * already holds. `formatMessage` reads `messages[id]` when it is called, not
 * when the provider was created, so a screen that renders after its chunk
 * loaded finds its words without the provider re-rendering, and so does the
 * shell's snackbar: a toast a feature thunk raises resolves under the SHELL's
 * provider, which is why W2-C's catalogues had to leave every snackbar id in
 * the shell catalogue. They no longer do.
 *
 * The maps only ever grow. A catalogue once loaded stays for the life of the
 * tab — which is the cost of one chunk that is already cached, and the reason
 * a toast raised on one screen still reads correctly after the merchant has
 * navigated to another.
 *
 * ── Hindi ───────────────────────────────────────────────────────────────────
 * The Hindi half of each catalogue is its own chunk, fetched when the locale
 * is `hi` (`useMessages` asks for it). Until it lands, the English strings
 * stand in — the documented fallback of §19.11.2, never a raw message id. When
 * it lands the Hindi map is REPLACED rather than written into, because text
 * already on screen must re-render, and a new object is what tells
 * `IntlProvider` so.
 *
 * Tests do not use any of this: `renderWithProviders` hands `IntlProvider`
 * every catalogue at once (`src/tests/allMessages.ts`). Whether each screen
 * loads the catalogues it needs is checked statically, over the import graph,
 * by `scripts/check-locales.mjs`.
 */
export type Messages = Record<string, string>;

export interface Catalogue {
  readonly name: string;
  readonly en: Readonly<Messages>;
  readonly loadHi: () => Promise<Readonly<Messages>>;
}

interface Entry {
  readonly catalogue: Catalogue;
  hi: Readonly<Messages> | null;
  loading: boolean;
}

const entries = new Map<string, Entry>();
const live: Record<Locale, Messages> = { en: {}, hi: {} };
const listeners = new Set<() => void>();
let version = 0;
let notifyQueued = false;

/**
 * Deferred a microtask: registration happens while a chunk is being evaluated,
 * which can be in the middle of a render, and a subscriber updated
 * synchronously from inside another component's render is React's "Cannot
 * update a component while rendering a different component".
 */
const notify = (): void => {
  version += 1;
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    listeners.forEach((listener) => listener());
  });
};

/**
 * Called once, at module scope, by each `src/i18n/catalogues/<name>.ts`.
 * Idempotent, so a module evaluated twice (HMR, a test re-import) is harmless.
 */
export const defineCatalogue = (catalogue: Catalogue): Catalogue => {
  if (entries.has(catalogue.name)) return catalogue;
  entries.set(catalogue.name, { catalogue, hi: null, loading: false });
  Object.assign(live.en, catalogue.en);
  // English stands in for the Hindi half until it lands — never a raw id.
  Object.assign(live.hi, catalogue.en);
  notify();
  return catalogue;
};

/** The live map for a locale. Same object until a Hindi half lands. */
export const liveMessages = (locale: Locale): Messages => live[locale];

/** Starts every Hindi half not yet fetched. No-op for `en`. */
export const ensureLocaleLoaded = (locale: Locale): void => {
  if (locale !== 'hi') return;
  entries.forEach((entry) => {
    if (entry.hi || entry.loading) return;
    entry.loading = true;
    void entry.catalogue.loadHi().then(
      (messages) => {
        entry.hi = messages;
        entry.loading = false;
        live.hi = { ...live.hi, ...messages };
        notify();
      },
      () => {
        // A failed chunk leaves English in place; the next locale change or
        // registration retries it.
        entry.loading = false;
      }
    );
  });
};

export const subscribeCatalogues = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const catalogueVersion = (): number => version;

/** The names registered so far — for diagnostics and tests. */
export const registeredCatalogues = (): readonly string[] => [...entries.keys()];
