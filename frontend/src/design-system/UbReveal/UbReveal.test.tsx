import { act, render, screen } from '@testing-library/react';

import { __resetIntersectionPools } from 'src/design-system/motion';

import { UbReveal } from './UbReveal';

/**
 * The defect a reveal invites is content that is invisible until a script
 * says otherwise — to a crawler, to a visitor on a slow phone whose JavaScript
 * has not arrived, and (the worst case) to the hero. So the default must be
 * VISIBLE, and only an element still below the fold may be put into the
 * hidden state, by JavaScript, after hydration.
 */
let callback: ((entries: Partial<IntersectionObserverEntry>[]) => void) | null = null;
let target: Element | null = null;

const installObserver = () => {
  window.IntersectionObserver = class {
    constructor(cb: typeof callback) {
      callback = cb;
    }
    observe(element: Element) {
      target = element;
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
};

const setReduced = (reduced: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
};

const belowTheFold = (top: number) =>
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect);

beforeEach(() => {
  __resetIntersectionPools();
  callback = null;
  target = null;
  setReduced(false);
});
afterEach(() => jest.restoreAllMocks());

describe('UbReveal', () => {
  it('leaves content visible where there is no IntersectionObserver', () => {
    // @ts-expect-error — removing the API is the condition under test
    delete window.IntersectionObserver;
    render(<UbReveal>Hello</UbReveal>);

    expect(screen.getByText('Hello')).not.toHaveAttribute('data-reveal');
  });

  it('never hides an element that is already on screen', () => {
    installObserver();
    belowTheFold(100);
    render(<UbReveal>On screen</UbReveal>);

    expect(screen.getByText('On screen')).not.toHaveAttribute('data-reveal');
  });

  it('hides an element below the fold and reveals it on arrival', () => {
    installObserver();
    belowTheFold(5000);
    render(<UbReveal stagger>Later</UbReveal>);

    const element = screen.getByText('Later');
    expect(element).toHaveAttribute('data-reveal', 'pending');
    expect(element).toHaveClass('ub-reveal-stagger');
    act(() => callback?.([{ target: target as Element, isIntersecting: true }]));
    expect(element).toHaveAttribute('data-reveal', 'shown');
  });

  it('stays static under reduced motion', () => {
    installObserver();
    setReduced(true);
    belowTheFold(5000);
    render(<UbReveal>Still</UbReveal>);

    expect(screen.getByText('Still')).not.toHaveAttribute('data-reveal');
  });
});
