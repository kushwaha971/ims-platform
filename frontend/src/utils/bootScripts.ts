/**
 * The two blocking scripts `app/layout.tsx` puts in `<head>`, built here so a
 * test can run them — they are strings, and a string nobody executes is a
 * string nobody has checked.
 *
 * Both are built FROM the constants their writers use rather than restating
 * a cookie name or a storage key. BRAND_INIT is why: it read
 * `localStorage['ub.theme_cache']` while `WhiteLabelSync` wrote through
 * `writeLocal('ub_theme_cache')`, which is `ub.ub_theme_cache`. The cache was
 * written on every load and read by nothing, so a teal shop opened in indigo
 * and turned teal a moment later — the flash WLB-01 FR-4 exists to prevent.
 */
import { THEME_CHOICE_COOKIE } from 'src/utils/cookieUtils';
import { localStorageKey } from 'src/utils/storage';
import { THEME_CACHE_KEY } from 'src/utils/theme';

/** The storage key `WhiteLabelSync` writes its ramp under. */
export const BRAND_CACHE_STORAGE_KEY = localStorageKey(THEME_CACHE_KEY);

/**
 * Resolve the theme before first paint.
 *
 * The fallback is `light`, not `prefers-color-scheme`. It used to be the media
 * query, which is why a merchant on a Mac set to Dark got a dark khata: the OS
 * decided, the specification said light, and the specification lost. §19.8.4's
 * reason for light is that the product is used in bright shops on cheap screens
 * — the operating system of the phone or laptop knows nothing about that.
 *
 * Only an explicit choice is read, and `ub_theme_choice` only ever holds one —
 * see `cookieUtils` for why it is not the old `ub_theme`.
 */
export const THEME_INIT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_CHOICE_COOKIE}=([^;]*)/);var t=m&&decodeURIComponent(m[1]);document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

/**
 * WLB-01 FR-4 — the tenant's brand ramp, before first paint.
 *
 * `WhiteLabelSync` writes the ramp it applied to `localStorage`
 * (`{tenantId, vars}`); this replays it before React exists, so a teal shop does
 * not open in indigo and turn teal a moment later. The session that loads next
 * corrects it if the active business changed (EC-6) — at worst one frame of the
 * previous brand, never the previous business's data. Only `--primary-*` and
 * the two accent aliases are ever in the cache; anything else is ignored.
 */
export const BRAND_INIT = `(function(){try{var c=JSON.parse(localStorage.getItem(${JSON.stringify(BRAND_CACHE_STORAGE_KEY)})||'null');if(!c||!c.vars)return;var s=document.documentElement.style;for(var k in c.vars){if(/^--(primary-[0-9]+|accent-quiet|accent-line)$/.test(k))s.setProperty(k,String(c.vars[k]));}}catch(e){}})();`;
