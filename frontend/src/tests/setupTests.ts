import '@testing-library/jest-dom';

/**
 * `src/constants.ts` validates its environment at module load, so the test run
 * has to supply the same variables the app requires (§19.14.1).
 *
 * Always a port nothing listens on — never the developer's own API. It used to
 * be `??=` with `localhost:8000`, which `.env.local` also names: with the dev
 * API up, a request a test forgot to mock reached the REAL server, got a 401
 * and signed the test's session out mid-render. The student page's test then
 * failed one run in two, and only while a dev server was running (L03 QA). An
 * unmocked request now fails fast as a network error, the same every time.
 */
process.env.NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:9/api/v1';

// jsdom has no matchMedia; ThemeProvider and the responsive hooks read it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

/**
 * jsdom has no `AbortSignal.timeout` either. It is the request ceiling on
 * §19.10.3's connectivity probe (`useDegradedNetwork`), and its absence is not
 * a harmless gap: `probe()` wraps its whole body in `try/catch` so that a dead
 * link is a `false` rather than a throw, which means a missing
 * `AbortSignal.timeout` makes the probe report a failed link WITHOUT EVER
 * CALLING `fetch`. A test of probe behaviour would then pass or fail for a
 * reason that has nothing to do with the code under test.
 *
 * Timers are the honest shape for it, so it also behaves under
 * `jest.useFakeTimers()`, which is how the probe's spacing is tested at all.
 */
if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
  Object.defineProperty(AbortSignal, 'timeout', {
    writable: true,
    configurable: true,
    value: (ms: number): AbortSignal => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
      return controller.signal;
    },
  });
}

/**
 * jsdom lacks the Pointer Events API that Radix's Select, Dialog and Drawer all
 * rely on, so a component from `ml-uikit` throws the moment a test opens one —
 * not because the component is wrong, but because the environment is missing a
 * browser API. These four are the exact set Radix touches; adding them is the
 * documented workaround rather than a behaviour change.
 *
 * `scrollIntoView` is here for the same reason: Radix calls it to bring the
 * highlighted option into view, and jsdom does not implement it.
 */
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => undefined;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
}

/**
 * jsdom has no ResizeObserver, and `cmdk` — the list `UbCombobox` is built on —
 * constructs one on mount. Same class of gap as the Pointer Events above: the
 * component is fine, the environment is missing a browser API.
 *
 * A no-op is the correct stand-in rather than a measuring shim. Nothing in jsdom
 * has a layout to observe — every element reports zero size — so a faithful
 * implementation would report zero changes anyway, and a test that depended on
 * real measurements would be lying about what it proved.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

// Keep the default OTP fixtures independent of the developer’s live provider.
process.env.NEXT_PUBLIC_OTP_PROVIDER = 'message_central';
