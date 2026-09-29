'use client';

import { memo, useEffect, useRef, useState } from 'react';

import { DEMO_VIDEO_URL_DESKTOP, DEMO_VIDEO_URL_MOBILE } from 'src/constants';
import { UbActionLink, UbDialog, UbStack, UbText, matchesNow } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { DEMO_CAPTIONS, DEMO_POSTERS, DESKTOP_MEDIA } from '../config/media';

/**
 * The narrated demo — its own chunk, loaded on the first "Watch the demo".
 *
 * Which film: the desktop cut from `lg`, the phone cut below it, read once
 * when the dialog opens. The URLs are configurable (`NEXT_PUBLIC_DEMO_VIDEO_URL_*`)
 * because the films are deliberately not in git; when the file is not there —
 * a checkout without them, a CDN that moved — the video's `error` replaces the
 * player with a sentence and a way forward, never a black rectangle with a
 * spinner. Captions are a `<track>` of the same Hinglish VTT the film carries —
 * burned in already, so the track is offered but not `default` (two copies of
 * every line otherwise).
 *
 * It is `UbDialog`, so Escape, the focus trap and focus returning to the
 * button are the product's one implementation of each.
 */
export interface DemoVideoDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function DemoVideoDialogBase({ open, onOpenChange }: Readonly<DemoVideoDialogProps>) {
  const { t } = useTranslation();
  const [desktop] = useState(() => matchesNow(DESKTOP_MEDIA));
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const src = desktop ? DEMO_VIDEO_URL_DESKTOP : DEMO_VIDEO_URL_MOBILE;
  const poster = desktop ? DEMO_POSTERS.desktop : DEMO_POSTERS.mobile;

  useEffect(() => {
    // The click that opened the dialog is the user activation that lets a
    // narrated film start with its sound; if the browser still refuses, the
    // controls are there.
    void videoRef.current?.play()?.catch?.(() => undefined);
  }, []);

  return (
    <UbDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('landing.demo.title')}
      description={t('landing.demo.description')}
      closeLabel={t('landing.demo.close')}
      className="sm:w-[min(64rem,calc(100vw-2rem))]"
    >
      {failed ? (
        <UbStack gap={4} align="start" data-testid="landing-demo-unavailable">
          <UbText variant="body" tone="secondary">
            {t('landing.demo.unavailable')}
          </UbText>
          <UbActionLink href={ROUTES.SIGNUP} variant="primary" size="lg" className="rounded-[14px]">
            {t('landing.demo.unavailableCta')}
          </UbActionLink>
        </UbStack>
      ) : (
        <video
          ref={videoRef}
          src={src}
          poster={poster.jpg}
          width={poster.width}
          height={poster.height}
          controls
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
          className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-card bg-black"
          style={{ aspectRatio: `${poster.width} / ${poster.height}` }}
          data-testid="landing-demo-video"
        >
          <track
            kind="captions"
            src={desktop ? DEMO_CAPTIONS.desktop : DEMO_CAPTIONS.mobile}
            srcLang={DEMO_CAPTIONS.srclang}
            label={t('landing.demo.captions')}
          />
        </video>
      )}
    </UbDialog>
  );
}

DemoVideoDialogBase.displayName = 'DemoVideoDialog';
export const DemoVideoDialog = memo(DemoVideoDialogBase);
