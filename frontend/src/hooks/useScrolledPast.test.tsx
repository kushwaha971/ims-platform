import { act, render, screen } from '@testing-library/react';

import { UbButton, UbPageHeader } from 'src/design-system';

import { useScrolledPast } from './useScrolledPast';

/**
 * The khata's docked pair appears only once the header pair has gone ABOVE the
 * viewport. "Not intersecting" alone would also be true of an element not yet
 * reached — below the fold on a short phone — and would dock a second pair on
 * a screen where the first is simply further down.
 */
let report: ((entry: Partial<IntersectionObserverEntry>) => void) | null = null;

class MockObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element): void {
    report = (entry) =>
      this.callback(
        [
          {
            target,
            rootBounds: { top: 0 } as DOMRectReadOnly,
            ...entry,
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver
      );
  }
  disconnect(): void {
    report = null;
  }
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function Probe(): React.JSX.Element {
  const [ref, past] = useScrolledPast<HTMLDivElement>();
  // The real wiring: the page header hands out the pair's element.
  return (
    <UbPageHeader
      title={past ? 'past' : 'here'}
      primaryActions={<UbButton>You gave</UbButton>}
      primaryActionsRef={ref}
    />
  );
}

beforeEach(() => {
  (global as { IntersectionObserver?: unknown }).IntersectionObserver = MockObserver;
});
afterEach(() => {
  delete (global as { IntersectionObserver?: unknown }).IntersectionObserver;
  report = null;
});

describe('useScrolledPast', () => {
  it('is true only once the element is above the top edge', () => {
    render(<Probe />);
    expect(screen.getByText('here')).toBeInTheDocument();

    act(() =>
      report?.({ isIntersecting: false, boundingClientRect: { bottom: -20 } as DOMRectReadOnly })
    );
    expect(screen.getByText('past')).toBeInTheDocument();

    act(() =>
      report?.({ isIntersecting: true, boundingClientRect: { bottom: 40 } as DOMRectReadOnly })
    );
    expect(screen.getByText('here')).toBeInTheDocument();
  });

  it('does not count an element below the fold as scrolled past', () => {
    render(<Probe />);
    act(() =>
      report?.({ isIntersecting: false, boundingClientRect: { bottom: 900 } as DOMRectReadOnly })
    );
    expect(screen.getByText('here')).toBeInTheDocument();
  });

  it('answers false where there is no IntersectionObserver', () => {
    delete (global as { IntersectionObserver?: unknown }).IntersectionObserver;
    render(<Probe />);
    expect(screen.getByText('here')).toBeInTheDocument();
  });
});
