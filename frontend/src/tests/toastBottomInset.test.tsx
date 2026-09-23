import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import { SnackbarHost } from 'src/components/layout/SnackbarHost';
import { UbBottomBar } from 'src/design-system';
import { UB_BOTTOM_INSET_PROPERTY, __resetBottomInset } from 'src/hooks/useBottomInset';
import { hideSnackbar } from 'src/redux/slice/snackbarSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { OnboardingStepActions } from 'modules/DigiKhaato/features/onboarding/components/OnboardingStepActions';

/**
 * CR-2026-09-19-G — THE TOAST DOES NOT LAND ON THE FURNITURE.
 *
 * A visual review at 360, 768 and 1280 found the global snackbar anchored
 * bottom-centre and sitting on top of whatever was already at the bottom of the
 * page: the onboarding wizard's sticky Continue bar (the primary action of the
 * screen, behind the error telling you the submit failed) and the `(auth)`
 * footer's legal links and LANGUAGE PICKER (the one control a merchant who
 * cannot read the English error needs). Not a z-index bug — the toast is
 * correctly above. The anchor assumed the bottom of the viewport was empty.
 *
 * This suite guards the whole chain rather than one screen's number, because
 * the defect is the kind that comes back on the NEXT screen with an action bar:
 *
 *   1. a `UbBottomBar` publishes how much of the viewport bottom it occupies as
 *      `--ub-bottom-inset` on `:root`;
 *   2. `--ub-toast-bottom` is that plus `env(safe-area-inset-bottom)` plus the
 *      gap;
 *   3. Tailwind's `bottom-toast` is that token, and the toast viewport wears it;
 *   4. so the toast's offset is never smaller than the furniture is tall.
 *
 * jsdom applies no stylesheet, so the arithmetic of step 2–4 is checked against
 * the files that declare it and then evaluated, rather than read back off
 * `getComputedStyle` — which in jsdom would happily return the empty string for
 * a correct implementation and a broken one alike.
 */

const ROOT = process.cwd();
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8');

const TOKENS = read('src/styles/tokens/primitives.css');
const TAILWIND = read('tailwind.config.js');

// ── The published inset ──────────────────────────────────────────────────────

const publishedInset = (): string =>
  document.documentElement.style.getPropertyValue(UB_BOTTOM_INSET_PROPERTY);

/** Pins the element's box, then makes the hook re-measure it. */
const place = (element: HTMLElement, top: number, height: number): void => {
  element.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 360,
      width: 360,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  act(() => {
    fireEvent.scroll(document.body);
  });
};

const VIEWPORT = 800;

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { value: VIEWPORT, writable: true });
  __resetBottomInset();
  store.dispatch(hideSnackbar());
});

afterEach(() => {
  __resetBottomInset();
});

describe('a bottom bar publishes its share of the viewport bottom', () => {
  it('reports its height while it is sitting on the bottom edge', async () => {
    renderWithProviders(
      <UbBottomBar data-testid="bar">
        <span>Continue</span>
      </UbBottomBar>
    );

    place(screen.getByTestId('bar'), VIEWPORT - 72, 72);

    await waitFor(() => expect(publishedInset()).toBe('72px'));
  });

  it('reports NOTHING once it has scrolled below the fold', async () => {
    renderWithProviders(<UbBottomBar data-testid="bar">x</UbBottomBar>);
    const bar = screen.getByTestId('bar');

    place(bar, VIEWPORT - 72, 72);
    await waitFor(() => expect(publishedInset()).toBe('72px'));

    // The `(auth)` footer is NOT sticky: on a long page it is off screen, and
    // there is nothing to clear when there is nothing to collide with.
    place(bar, VIEWPORT + 40, 72);
    await waitFor(() => expect(publishedInset()).toBe(''));
  });

  it('takes the TALLEST of several, because the furniture stacks on one edge', async () => {
    renderWithProviders(
      <>
        <UbBottomBar data-testid="nav">nav</UbBottomBar>
        <UbBottomBar data-testid="actions">actions</UbBottomBar>
      </>
    );

    place(screen.getByTestId('nav'), VIEWPORT - 64, 64);
    place(screen.getByTestId('actions'), VIEWPORT - 96, 96);

    await waitFor(() => expect(publishedInset()).toBe('96px'));
  });

  it('gives the edge back when it unmounts', async () => {
    const { unmount } = renderWithProviders(<UbBottomBar data-testid="bar">x</UbBottomBar>);

    place(screen.getByTestId('bar'), VIEWPORT - 72, 72);
    await waitFor(() => expect(publishedInset()).toBe('72px'));

    unmount();
    await waitFor(() => expect(publishedInset()).toBe(''));
  });
});

// ── The two screens the review found ─────────────────────────────────────────

describe('the two archetypes that own the bottom of the page declare it', () => {
  it('the wizard’s Continue bar is a bottom bar', () => {
    renderWithProviders(
      <OnboardingStepActions
        onBack={null}
        continueLabel="Continue"
        busyLabel="Saving"
        backLabel="Back"
        skipLabel="Skip"
        busy={false}
        disabled={false}
      />
    );

    const bar = screen.getByRole('button', { name: 'Continue' }).closest('[data-ub-bottom-bar]');
    expect(bar).not.toBeNull();
    // It is still the sticky bar it always was.
    expect(bar?.className).toContain('sticky');
    expect(bar?.className).toContain('bottom-0');
  });
});

// ── The anchor, and the arithmetic behind it ─────────────────────────────────

describe('the toast viewport reads the custom property', () => {
  const toastViewport = (): HTMLElement => {
    renderWithProviders(<SnackbarHost />);
    const region = screen.getAllByRole('status')[0];
    const viewport = region?.parentElement;
    if (!viewport) throw new Error('the toast viewport is not mounted');
    return viewport;
  };

  it('is anchored top-centre, 25 px down — BrandHub CustomerSnackbar', () => {
    const viewport = toastViewport();

    /* The owner moved it (Sep 2026): top-centre at every width, the way
       BrandHub's snackbar sits, clear of every bottom bar by construction.
       The bottom-inset arithmetic below is kept: `UbBottomBar` still
       publishes its height and a bottom-anchored overlay can use it. */
    expect(viewport.className).toContain('top-[25px]');
    // The offsets it used to carry. `bottom-20` was a guess at the height of a
    // `UbBottomNav` that does not exist yet — a number per screen, in the toast.
    expect(viewport.className).not.toContain('bottom-20');
    expect(viewport.className).not.toContain('md:bottom-6');
    // Bottom-centre at every width is a decision, not an oversight: see
    // mlToastPrimitives.tsx. Nothing may quietly re-anchor it to a corner.
    expect(viewport.className).not.toContain('right-0');
    expect(viewport.className).toContain('inset-x-0');
  });

  it('keeps both live regions permanently mounted with no message (R-A-7)', () => {
    renderWithProviders(<SnackbarHost />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    expect(screen.queryByTestId('snackbar')).not.toBeInTheDocument();
  });

  it('resolves `bottom-toast` through Tailwind to the token', () => {
    expect(TAILWIND).toMatch(/inset:\s*\{\s*toast:\s*'var\(--ub-toast-bottom\)'/);
  });

  it('builds that token from the inset, the safe area and the gap', () => {
    expect(TOKENS).toMatch(/--ub-bottom-inset:\s*0px;/);
    const declaration = /--ub-toast-bottom:\s*calc\(([^;]*)\);/.exec(TOKENS)?.[1];

    expect(declaration).toBeDefined();
    // The furniture …
    expect(declaration).toContain('var(--ub-bottom-inset)');
    // … and the phone's home indicator, which the earlier fix must survive.
    expect(declaration).toContain('env(safe-area-inset-bottom, 0px)');
    expect(declaration).toContain('var(--ub-toast-gap)');
  });
});

/**
 * THE OVERLAP ITSELF.
 *
 * The three tests above each hold one link of the chain; this one joins them
 * and asks the only question the review actually asked: with a 96 px action bar
 * on screen, is the toast's bottom offset at least 96 px? It evaluates the
 * declared `calc()` rather than restating it, so deleting `var(--ub-bottom-inset)`
 * from the token — the exact regression — fails here rather than silently
 * passing a class-name assertion.
 */
describe('the toast cannot overlap a sticky bottom bar', () => {
  const PX: Readonly<Record<string, number>> = {
    'var(--ub-bottom-inset)': NaN, // supplied per case
    'env(safe-area-inset-bottom, 0px)': 0,
    'var(--ub-toast-gap)': 16, // --space-4 below `md`
  };

  /** Evaluates `--ub-toast-bottom` for a given published inset, in px. */
  const toastBottomPx = (insetPx: number): number => {
    const declaration = /--ub-toast-bottom:\s*calc\(([^;]*)\);/.exec(TOKENS)?.[1] ?? '';
    return declaration
      .split('+')
      .map((term) => term.replace(/\s+/g, ' ').trim())
      .reduce((total, term) => {
        if (term === 'var(--ub-bottom-inset)') return total + insetPx;
        const known = PX[term];
        if (known === undefined) throw new Error(`unknown term in --ub-toast-bottom: ${term}`);
        return total + known;
      }, 0);
  };

  it('clears a 96 px action bar, with the safe area still intact', async () => {
    renderWithProviders(
      <>
        <UbBottomBar data-testid="bar">actions</UbBottomBar>
        <SnackbarHost />
      </>
    );
    place(screen.getByTestId('bar'), VIEWPORT - 96, 96);
    await waitFor(() => expect(publishedInset()).toBe('96px'));

    const bottom = toastBottomPx(Number.parseInt(publishedInset(), 10));

    // Strictly greater: the toast clears the bar AND keeps a gap above it.
    expect(bottom).toBeGreaterThan(96);
    expect(bottom).toBe(112);
  });

  it('sits at the plain gap when nothing is at the bottom of the page', () => {
    expect(publishedInset()).toBe('');
    expect(toastBottomPx(0)).toBe(16);
  });
});

/**
 * The entrance animation. `animate-fade-in` translates the toast, and it is the
 * one animation in the product that appears unbidden, so it has to honour the
 * user's preference. It does it through the duration token, which is zeroed
 * under `prefers-reduced-motion` — a literal `140ms` here opted it out.
 */
describe('the toast respects prefers-reduced-motion', () => {
  it('drives its entrance from the duration token, not a number', () => {
    expect(TAILWIND).toMatch(/'fade-in':\s*'fade-in var\(--dur-fast\) var\(--ease-entrance\)'/);
    expect(TOKENS).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*--dur-fast:\s*0ms;/);
  });
});
