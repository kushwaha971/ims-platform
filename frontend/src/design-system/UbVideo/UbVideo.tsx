'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { Pause, Play } from 'lucide-react';
import { preload } from 'react-dom';

import {
  matchesNow,
  useInView,
  useMediaQuery,
  usePrefersReducedMotion,
} from 'src/design-system/motion';
import { cn } from 'src/utils/cn';

/**
 * A silent product loop: muted, inline, looping, and cheap until it matters.
 *
 * What it guarantees, in the order a visitor meets them:
 *
 *  1. **Zero layout shift.** The box is sized by `aspect-ratio` from the
 *     clip's own `width`/`height`, and the poster (webp, jpg fallback) paints
 *     in it immediately. The poster stays up until the video has a frame.
 *  2. **Nothing downloads early.** `preload="none"`, and no `<source>` exists
 *     at all until the element is within ~200 px of the viewport (the shared
 *     IntersectionObserver). Then webm first, mp4 second, each with its codecs.
 *  3. **One device variant.** With `media`, the query is read with
 *     `matchMedia` BEFORE a source is ever set, so a page carrying a desktop
 *     clip and a phone clip (one of them `display: none`) downloads only the
 *     one on screen. The posters are `loading="lazy"` in that case, which a
 *     browser does not fetch for a hidden element; the visible one arrives via
 *     `priority`'s `<link rel=preload media=…>` instead, so the LCP poster is
 *     still first in the queue.
 *  4. **It stops when nobody is watching** — scrolled away, or the tab hidden.
 *  5. **Reduced motion means no autoplay.** The poster, and a play button.
 *  6. **A pause control, always** (WCAG 2.2.2: anything that moves for more
 *     than five seconds can be paused).
 *  7. **Failure is a poster, not a black box.** If `play()` is refused (Low
 *     Power Mode, a data saver) the play button appears; if the file itself
 *     fails, the poster stays and a text link to the file is offered.
 *
 * The clip is described by `alt` on a `role="img"` wrapper; the `<video>` is
 * hidden from assistive technology, since a silent loop has nothing else to say.
 */
export interface UbVideoSource {
  readonly src: string;
  /** Full type with codecs, e.g. `video/webm; codecs=vp9`. */
  readonly type: string;
}

export interface UbVideoPoster {
  readonly webp?: string;
  readonly jpg: string;
}

export interface UbVideoLabels {
  readonly play: string;
  readonly pause: string;
  /** The text of the link offered when the file cannot be played. */
  readonly fallback: string;
}

export interface UbVideoProps {
  readonly sources: readonly UbVideoSource[];
  readonly poster: UbVideoPoster;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly labels: UbVideoLabels;
  /** Only load (and play) while this media query matches. */
  readonly media?: string;
  /** The LCP candidate: preload the poster at high priority. */
  readonly priority?: boolean;
  /** Autoplay muted when in view. False waits for the play button. */
  readonly autoPlay?: boolean;
  readonly rootMargin?: string;
  readonly className?: string;
}

type Status = 'idle' | 'playing' | 'paused' | 'blocked' | 'failed';

function UbVideoBase({
  sources,
  poster,
  width,
  height,
  alt,
  labels,
  media,
  priority = false,
  autoPlay = true,
  rootMargin = '200px',
  className,
}: Readonly<UbVideoProps>) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const mediaMatches = useMediaQuery(media);
  const active = !media || mediaMatches;
  const near = useInView(boxRef, { rootMargin, enabled: active });
  const [loaded, setLoaded] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  /** The person pressed pause (or has not pressed play under reduced motion). */
  const [userPaused, setUserPaused] = useState(false);
  const [userStarted, setUserStarted] = useState(false);
  const [hidden, setHidden] = useState(false);

  // The LCP poster: queued at high priority, for the viewport that shows it.
  if (priority) {
    const href = poster.webp ?? poster.jpg;
    preload(href, {
      as: 'image',
      fetchPriority: 'high',
      type: poster.webp ? 'image/webp' : 'image/jpeg',
      ...(media ? { media } : {}),
    });
  }

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const wantsPlay = autoPlay && !reduced ? !userPaused : userStarted && !userPaused;

  // Sources are assigned once, the first time it is near and wanted. `active`
  // comes from `useSyncExternalStore`, which reads `matchMedia` during THIS
  // render — so the device variant is settled before a `<source>` exists.
  // Latched in state during render (React's "adjust state on change" pattern)
  // so scrolling away later does not tear the sources down mid-download.
  if (!loaded && near && active && wantsPlay) setLoaded(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !loaded) return;
    const shouldPlay = near && active && !hidden && wantsPlay && status !== 'failed';
    if (!shouldPlay) {
      if (!video.paused) video.pause();
      return;
    }
    video.muted = true;
    const attempt = video.play();
    // jsdom and some older engines return undefined rather than a promise.
    attempt?.catch?.((error: unknown) => {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'AbortError') return; // a pause() raced it — not a failure
      setStatus(name === 'NotAllowedError' ? 'blocked' : 'failed');
    });
  }, [loaded, near, active, hidden, wantsPlay, status]);

  /** Whether it is, or is about to be, playing — what the toggle offers to stop. */
  const intendsPlay = wantsPlay && status !== 'blocked' && status !== 'failed';

  const onToggle = useCallback(() => {
    if (intendsPlay) {
      setUserPaused(true);
      videoRef.current?.pause();
      return;
    }
    // A click is the user activation a refused play() was waiting for; the
    // effect above calls play() on the next commit, still inside it.
    setUserPaused(false);
    setUserStarted(true);
    setStatus((current) => (current === 'blocked' ? 'idle' : current));
    if (!loaded && matchesNow(media)) setLoaded(true);
  }, [intendsPlay, loaded, media]);

  const onFailed = useCallback(() => setStatus('failed'), []);
  const lastSource = sources.length - 1;
  const lazyPoster = !priority || !!media;
  const fallbackHref = sources[sources.length - 1]?.src ?? '';

  return (
    <div
      ref={boxRef}
      className={cn('relative w-full overflow-hidden bg-surface-subtle', className)}
      style={{ aspectRatio: `${width} / ${height}` }}
      data-video-status={status}
      data-video-loaded={loaded || undefined}
    >
      <div role="img" aria-label={alt} className="absolute inset-0">
        <picture>
          {poster.webp && <source srcSet={poster.webp} type="image/webp" />}
          {/* A poster behind a <video>, sized by the box; next/image would add a
              wrapper and an optimiser round-trip to the LCP element. */}
          <img
            src={poster.jpg}
            alt=""
            width={width}
            height={height}
            loading={lazyPoster ? 'lazy' : 'eager'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            className={cn(
              'absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-base',
              hasFrame && status !== 'failed' ? 'opacity-0' : 'opacity-100'
            )}
          />
        </picture>
        <video
          ref={videoRef}
          aria-hidden
          tabIndex={-1}
          muted
          playsInline
          loop
          preload="none"
          width={width}
          height={height}
          disablePictureInPicture
          onPlaying={() => {
            setHasFrame(true);
            setStatus('playing');
          }}
          onPause={() => setStatus((s) => (s === 'failed' || s === 'blocked' ? s : 'paused'))}
          onError={onFailed}
          className={cn(
            'absolute inset-0 h-full w-full object-cover object-top',
            status === 'failed' && 'invisible'
          )}
        >
          {loaded &&
            sources.map((source, i) => (
              <source
                key={source.src}
                src={source.src}
                type={source.type}
                // Every <source> failing fires `error` on the LAST one, not on
                // the video — the one place a missing file is reported.
                onError={i === lastSource ? onFailed : undefined}
              />
            ))}
        </video>
      </div>

      {status === 'failed' ? (
        <a
          href={fallbackHref}
          className="absolute bottom-3 left-3 rounded-pill bg-surface-card/90 px-3 py-1.5 ds-body-s-medium text-text-accent underline underline-offset-2 shadow-sm backdrop-blur"
        >
          {labels.fallback}
        </a>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-label={intendsPlay ? labels.pause : labels.play}
          data-testid="ub-video-toggle"
          className={cn(
            'ub-hit absolute flex items-center justify-center rounded-pill text-text-primary',
            'bg-surface-card/90 shadow-sm ring-1 ring-border-hairline backdrop-blur',
            'transition-transform duration-fast ease-standard active:scale-95',
            'outline-none focus-visible:shadow-focus',
            intendsPlay
              ? 'bottom-3 right-3 h-8 w-8 hover:scale-105'
              : 'left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2'
          )}
        >
          {intendsPlay ? (
            <Pause aria-hidden className="h-3.5 w-3.5" />
          ) : (
            <Play aria-hidden className="h-6 w-6 translate-x-0.5" />
          )}
        </button>
      )}
    </div>
  );
}

UbVideoBase.displayName = 'UbVideo';
export const UbVideo = memo(UbVideoBase);
