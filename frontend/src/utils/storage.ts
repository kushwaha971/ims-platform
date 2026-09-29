/**
 * `localStorage` access, guarded. R-H-6: browser APIs are touched in one place,
 * behind a try/catch, because Safari in private mode throws on write and a
 * crashed preference read must never take a screen down.
 *
 * Keys are namespaced `ub.<feature>.<key>`; nothing stored here is ever trusted
 * for authorisation (§19.7.1).
 */
const PREFIX = 'ub.';

/**
 * The key `writeLocal(key)` actually writes. Exported for the one reader that
 * cannot call `readLocal`: the pre-paint script in `app/layout.tsx`, which runs
 * before any module exists and so has to be handed the finished string. It used
 * to spell the key by hand — `ub.theme_cache` against the `ub.ub_theme_cache`
 * this module writes — and a tenant's brand never survived a reload.
 */
export const localStorageKey = (key: string): string => `${PREFIX}${key}`;

const available = (): boolean => typeof window !== 'undefined' && !!window.localStorage;

export const readLocal = <T>(key: string, fallback: T): T => {
  if (!available()) return fallback;
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};

export const writeLocal = (key: string, value: unknown): void => {
  if (!available()) return;
  try {
    window.localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Quota or private mode: a preference is not worth an exception.
  }
};

export const removeLocal = (key: string): void => {
  if (!available()) return;
  try {
    window.localStorage.removeItem(`${PREFIX}${key}`);
  } catch {
    // ignored, as above
  }
};

/** The keys under `ub.<prefix>`, without the `ub.` — for a namespace that is enumerated (SAL-06). */
export const listLocalKeys = (prefix: string): string[] => {
  if (!available()) return [];
  try {
    return Object.keys(window.localStorage)
      .filter((key) => key.startsWith(`${PREFIX}${prefix}`))
      .map((key) => key.slice(PREFIX.length));
  } catch {
    return [];
  }
};

/** Logout and tenant switch clear everything except the draft namespace. */
export const clearLocalExceptDrafts = (): void => {
  if (!available()) return;
  try {
    const keys = Object.keys(window.localStorage).filter(
      (key) => key.startsWith(PREFIX) && !key.includes('.draft.')
    );
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignored, as above
  }
};
