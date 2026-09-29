import { act, fireEvent, render, screen } from '@testing-library/react';

import { __resetIntersectionPools } from 'src/design-system/motion';

import { UbVideo } from './UbVideo';

/**
 * UbVideo's promises are all about what it does NOT do — download early, fetch
 * the wrong device's clip, autoplay against a reduced-motion preference, keep
 * playing offscreen. jsdom has no layout, no IntersectionObserver and no media
 * pipeline, so each is driven by hand: the observer's callback, the media
 * query's answer, and `play()`/`pause()` as spies.
 */
type IoCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let ioCallback: IoCallback | null = null;
let observed: Element[] = [];
const queries: Record<string, boolean> = {};

const intersect = (isIntersecting: boolean) =>
  act(() => {
    ioCallback?.(observed.map((target) => ({ target, isIntersecting })));
  });

let play: jest.Mock;
let pause: jest.Mock;

beforeEach(() => {
  __resetIntersectionPools();
  observed = [];
  ioCallback = null;
  Object.keys(queries).forEach((key) => delete queries[key]);
  window.IntersectionObserver = class {
    constructor(callback: IoCallback) {
      ioCallback = callback;
    }
    observe(element: Element) {
      observed.push(element);
    }
    unobserve(element: Element) {
      observed = observed.filter((e) => e !== element);
    }
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  window.matchMedia = ((query: string) => ({
    matches: queries[query] ?? false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  play = jest.fn(() => Promise.resolve());
  pause = jest.fn();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get: () => false,
  });
});

const SOURCES = [
  { src: '/media/landing/hero-desktop.webm', type: 'video/webm; codecs=vp9' },
  { src: '/media/landing/hero-desktop.mp4', type: 'video/mp4; codecs=avc1.4D4020' },
];

const renderVideo = (props: Partial<React.ComponentProps<typeof UbVideo>> = {}) =>
  render(
    <UbVideo
      sources={SOURCES}
      poster={{ webp: '/p.webp', jpg: '/p.jpg' }}
      width={1280}
      height={800}
      alt="The dashboard, then a khata entry"
      labels={{ play: 'Play video', pause: 'Pause video', fallback: 'Open the video' }}
      {...props}
    />
  );

const sources = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('source[type^="video"]')).map((s) => s.getAttribute('src'));

describe('UbVideo', () => {
  it('reserves the box from the clip size and shows the poster before anything loads', () => {
    const { container } = renderVideo();

    const box = container.firstElementChild as HTMLElement;
    expect(box.style.aspectRatio).toBe('1280 / 800');
    expect(container.querySelector('img')).toHaveAttribute('src', '/p.jpg');
    expect(container.querySelector('video')).toHaveAttribute('preload', 'none');
    expect(sources(container)).toEqual([]);
    expect(screen.getByRole('img', { name: 'The dashboard, then a khata entry' })).toBeInTheDocument();
  });

  /** Nothing is requested until the clip is near the viewport. */
  it('assigns webm then mp4 only once it is near the viewport, and plays muted', () => {
    const { container } = renderVideo();
    expect(sources(container)).toEqual([]);

    intersect(true);

    expect(sources(container)).toEqual(SOURCES.map((s) => s.src));
    expect(container.querySelectorAll('source[type="video/mp4; codecs=avc1.4D4020"]')).toHaveLength(1);
    expect(play).toHaveBeenCalled();
    expect((container.querySelector('video') as HTMLVideoElement).muted).toBe(true);
  });

  /**
   * The hero carries a desktop clip and a phone clip, one of them hidden by
   * CSS. If the variant were chosen after sources were set, a phone would
   * download the 1.1 MB desktop loop it never shows.
   */
  it('sets no source at all while its device media query does not match', () => {
    queries['(min-width: 1024px)'] = false;
    const { container } = renderVideo({ media: '(min-width: 1024px)' });

    intersect(true);

    expect(sources(container)).toEqual([]);
    expect(play).not.toHaveBeenCalled();
    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy');
  });

  it('loads its variant when the query matches', () => {
    queries['(min-width: 1024px)'] = true;
    const { container } = renderVideo({ media: '(min-width: 1024px)' });

    intersect(true);

    expect(sources(container)).toHaveLength(2);
  });

  /** WCAG 2.3.3 — a person who asked for less motion is not shown a loop. */
  it('does not autoplay under reduced motion, and plays on request', () => {
    queries['(prefers-reduced-motion: reduce)'] = true;
    const { container } = renderVideo();

    intersect(true);

    expect(play).not.toHaveBeenCalled();
    expect(sources(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    expect(sources(container)).toHaveLength(2);
    expect(play).toHaveBeenCalled();
  });

  it('pauses when it scrolls away and when the tab is hidden', () => {
    renderVideo();
    intersect(true);
    expect(play).toHaveBeenCalledTimes(1);

    intersect(false);
    expect(pause).toHaveBeenCalled();

    pause.mockClear();
    intersect(true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(pause).toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  /** WCAG 2.2.2 — anything moving for more than five seconds can be paused. */
  it('always offers a pause control while playing', () => {
    renderVideo();
    intersect(true);

    fireEvent.click(screen.getByRole('button', { name: 'Pause video' }));

    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument();
  });

  /** A missing or undecodable file must leave the poster, not a black box. */
  it('keeps the poster and offers a link to the file when every source fails', () => {
    const { container } = renderVideo();
    intersect(true);

    const last = container.querySelectorAll('source[type^="video"]')[1] as HTMLSourceElement;
    fireEvent.error(last);

    expect(container.querySelector('img')).toHaveClass('opacity-100');
    expect(screen.getByRole('link', { name: 'Open the video' })).toHaveAttribute(
      'href',
      '/media/landing/hero-desktop.mp4'
    );
  });

  it('keeps the poster and shows a play button when play() is refused', async () => {
    play.mockImplementation(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    renderVideo();

    intersect(true);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument();
  });
});
