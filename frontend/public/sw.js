/* eslint-disable */
/**
 * YourKhata's service worker — Part 19 §19.10.2, written by hand (ADR-021: Workbox
 * is not on the list). QA B50 (12 Oct 2026): the installed app had a manifest and
 * no worker, so every cold launch downloaded ~1.4 MB of script before a tap did
 * anything, and nothing at all opened without a signal.
 *
 * What it does, and the one place it departs from §19.10.2:
 *
 *  · Static files (`/_next/static/**`, fonts, icons, brand) — cache-first. Their
 *    names are content-hashed, so a cached copy is never wrong; the cache is
 *    trimmed to the newest STATIC_LIMIT entries so old builds age out.
 *  · Page loads — network-first with a 3 s timeout, then the last good copy of
 *    that page, then the last good copy of any app page. A repeat launch on a bad
 *    signal opens instead of showing the browser's dinosaur. Old chunks stay in
 *    the static cache, so a cached page never points at a deleted file.
 *  · A few API reads (the session, the dashboard, the party and item lists, a
 *    khata's first page) — NETWORK-FIRST, falling back to the last copy only when
 *    the network fails. §19.10.2 says stale-while-revalidate; that would hand the
 *    app a cached `/auth/me` straight after a sign-out or a business switch, and a
 *    wrong session on screen is worse than a slow one. Offline the merchant still
 *    gets the last data, which is what B50 asks for.
 *    The cache is per business (`ub-api-<tenant>`), and the page tells the worker
 *    which business is open; with no business named nothing is cached, and on
 *    sign-out or a switch every API cache is deleted (§19.10.2's two hard rules).
 *  · Everything else, and every write — straight to the network, never cached,
 *    never replayed.
 */

var VERSION = 'v1';
var STATIC_CACHE = 'ub-static-' + VERSION;
var PAGE_CACHE = 'ub-pages-' + VERSION;
var API_PREFIX = 'ub-api-';
var STATIC_LIMIT = 400;
var PAGE_TIMEOUT_MS = 3000;
/** Where the open business is remembered: a browser stops an idle worker within
 *  seconds, and a worker that forgot the business would skip its cache exactly
 *  when the merchant reopens the app without signal. */
var META_CACHE = 'ub-meta';
var TENANT_KEY = '/__ub/tenant';

/** API reads worth having offline. A khata's FIRST page only (no cursor). */
var API_READS = [
  /^\/api\/v1\/auth\/me\/?$/,
  /^\/api\/v1\/reports\/dashboard\/?$/,
  /^\/api\/v1\/parties\/?$/,
  /^\/api\/v1\/items\/?$/,
  /^\/api\/v1\/parties\/[0-9a-f-]+\/?$/,
  /^\/api\/v1\/parties\/[0-9a-f-]+\/ledger-entries\/?$/,
];

/**
 * Which strategy a request gets: 'static', 'page', 'api' or 'network'. Pure, so the
 * unit test can hold every rule to account without a browser.
 */
function strategyFor(request, origin) {
  if (request.method !== 'GET') return 'network';
  var url = new URL(request.url);
  if (request.mode === 'navigate' && url.origin === origin) return 'page';
  if (url.origin === origin) {
    var p = url.pathname;
    if (
      p.indexOf('/_next/static/') === 0 ||
      p.indexOf('/fonts/') === 0 ||
      p.indexOf('/icons/') === 0 ||
      p.indexOf('/brand/') === 0
    ) {
      return 'static';
    }
  }
  if (url.pathname.indexOf('/api/v1/') !== -1) {
    var path = url.pathname.slice(url.pathname.indexOf('/api/v1/'));
    if (url.searchParams.has('cursor') || url.searchParams.has('format')) return 'network';
    for (var i = 0; i < API_READS.length; i += 1) {
      if (API_READS[i].test(path)) return 'api';
    }
  }
  return 'network';
}

if (typeof module !== 'undefined') {
  module.exports = { strategyFor: strategyFor, API_READS: API_READS };
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function' && typeof module === 'undefined') {
  var tenant;

  var readTenant = function () {
    if (tenant !== undefined) return Promise.resolve(tenant);
    return caches.open(META_CACHE).then(function (cache) {
      return cache.match(TENANT_KEY).then(function (hit) {
        return hit ? hit.text() : '';
      });
    }).then(function (id) {
      tenant = id || null;
      return tenant;
    });
  };

  var writeTenant = function (id) {
    tenant = id;
    return caches.open(META_CACHE).then(function (cache) {
      return id ? cache.put(TENANT_KEY, new Response(id)) : cache.delete(TENANT_KEY);
    });
  };

  var trim = function (cacheName, limit) {
    return caches.open(cacheName).then(function (cache) {
      return cache.keys().then(function (keys) {
        if (keys.length <= limit) return undefined;
        return Promise.all(keys.slice(0, keys.length - limit).map(function (k) { return cache.delete(k); }));
      });
    });
  };

  var clearApi = function (keep) {
    return caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (n) { return n.indexOf(API_PREFIX) === 0 && n !== keep; })
          .map(function (n) { return caches.delete(n); })
      );
    });
  };

  self.addEventListener('install', function () { self.skipWaiting(); });

  self.addEventListener('activate', function (event) {
    event.waitUntil(
      caches.keys().then(function (names) {
        return Promise.all(
          names
            .filter(function (n) {
              return (n.indexOf('ub-static-') === 0 && n !== STATIC_CACHE) ||
                (n.indexOf('ub-pages-') === 0 && n !== PAGE_CACHE);
            })
            .map(function (n) { return caches.delete(n); })
        );
      }).then(function () { return self.clients.claim(); })
    );
  });

  self.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 'tenant') {
      var next = data.id ? String(data.id) : null;
      event.waitUntil(
        readTenant().then(function (current) {
          if (next === current) return undefined;
          return writeTenant(next).then(function () {
            return clearApi(next ? API_PREFIX + next : null);
          });
        })
      );
    } else if (data.type === 'signed-out') {
      event.waitUntil(
        writeTenant(null)
          .then(function () { return clearApi(null); })
          .then(function () { return caches.delete(PAGE_CACHE); })
      );
    }
  });

  var cacheFirst = function (request) {
    return caches.open(STATIC_CACHE).then(function (cache) {
      return cache.match(request).then(function (hit) {
        if (hit) return hit;
        return fetch(request).then(function (response) {
          if (response.ok) {
            cache.put(request, response.clone());
            trim(STATIC_CACHE, STATIC_LIMIT);
          }
          return response;
        });
      });
    });
  };

  var page = function (request) {
    var url = new URL(request.url);
    var key = url.origin + url.pathname;
    var network = fetch(request).then(function (response) {
      if (response.ok && response.type === 'basic') {
        var copy = response.clone();
        caches.open(PAGE_CACHE).then(function (cache) { cache.put(key, copy); });
      }
      return response;
    });
    var timeout = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, PAGE_TIMEOUT_MS);
    });
    var fallback = function () {
      return caches.open(PAGE_CACHE).then(function (cache) {
        return cache.match(key).then(function (hit) {
          if (hit) return hit;
          return cache.keys().then(function (keys) {
            return keys.length ? cache.match(keys[keys.length - 1]) : null;
          });
        });
      });
    };
    return Promise.race([network, timeout])
      .then(function (response) {
        if (response) return response;
        return fallback().then(function (hit) { return hit || network; });
      })
      .catch(function () {
        return fallback().then(function (hit) {
          return hit || new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
              '<title>No signal</title><p style="font-family:sans-serif;padding:24px">No signal. ' +
              'Open the app again when you are back online.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      });
  };

  var api = function (request) {
    return readTenant().then(function (id) {
      return id ? apiFor(request, API_PREFIX + id) : fetch(request);
    });
  };

  var apiFor = function (request, name) {
    return fetch(request)
      .then(function (response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(name).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      })
      .catch(function (error) {
        return caches.open(name).then(function (cache) {
          return cache.match(request).then(function (hit) {
            if (hit) return hit;
            throw error;
          });
        });
      });
  };

  self.addEventListener('fetch', function (event) {
    var strategy = strategyFor(event.request, self.location.origin);
    if (strategy === 'static') event.respondWith(cacheFirst(event.request));
    else if (strategy === 'page') event.respondWith(page(event.request));
    else if (strategy === 'api') event.respondWith(api(event.request));
  });
}
