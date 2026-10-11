'use client';

import { memo, useCallback, useRef, useState } from 'react';

import { Play } from 'lucide-react';

import {
  UbActionLink,
  UbBox,
  UbButton,
  UbDisclosure,
  UbPicture,
  UbReveal,
  UbStack,
  UbText,
  matchesNow,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';

import { DEMO_TRANSCRIPT } from '../config/demoTranscript';
import {
  DEMO_FILMS,
  DEMO_VOICE,
  DESKTOP_MEDIA,
  demoVideoUrl,
  type DemoDevice,
  type DemoLanguage,
} from '../config/media';

import { LANDING_CONTAINER, LANDING_SECTION, LandingSectionHeading } from './LandingPrimitives';

const LANGUAGES: readonly DemoLanguage[] = ['en', 'hi'];

/** `75` → `1:15`. */
export const demoClock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;

/**
 * #demo — the narrated product demo (owner, 10 Oct 2026; one film since 11 Oct).
 *
 * What a visitor's connection pays for it before they press play: ONE poster
 * image, lazily, and nothing else. There is no `<video>` in the page until the
 * play button is pressed — a `preload="none"` video still costs a player, and
 * a `metadata` one costs a range request per film — so a film of several
 * megabytes adds nothing to the first load. Nothing plays by itself and
 * nothing plays with sound until it is asked to.
 *
 * TWO CUTS: the desktop layout in 16:9 and the phone layout in portrait. Below
 * `lg` the frame is the phone cut's shape and shows the phone poster; from
 * `lg` it is 16:9 with the desktop poster — decided by CSS, so the box is
 * right from the first paint and nothing moves when the poster or the player
 * arrives (CLS). Which FILE plays is read when play is pressed, from the same
 * breakpoint, so a phone never downloads the desktop film nor a desktop the
 * phone one.
 *
 * ONE NARRATION, in Hindi (owner, 11 Oct 2026: the separate English film is
 * withdrawn). Somebody reading the page in English is not left out: the film
 * carries an English subtitle track, on by default for them, and the chapters
 * and transcript below it are in the page's language. Captions are on by
 * default in either language — most phones are on mute.
 *
 * Every word, in BOTH languages, is in the server's HTML: the chapters and the
 * transcript are rendered for both, the one that is not the page's `hidden`,
 * and the transcript sits in a `keepMounted` disclosure. A crawler or an
 * answer engine reads what the film says without playing it, and the
 * VideoObject structured data (`app/page.tsx`) quotes the same text.
 */
function DemoSectionBase() {
  const { t, locale } = useTranslation();
  /** The language of the words AROUND the film, and of the track that is on. */
  const language: DemoLanguage = locale === 'hi' ? 'hi' : 'en';
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [startAt, setStartAt] = useState(0);
  /** The cut being played; chosen at the moment play is pressed. */
  const [device, setDevice] = useState<DemoDevice>('desktop');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /** Play from a chapter: start the player there, or seek it if it is running. */
  const playFrom = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = seconds;
      void video.play()?.catch?.(() => undefined);
      return;
    }
    setDevice(matchesNow(DESKTOP_MEDIA) ? 'desktop' : 'mobile');
    setStartAt(seconds);
    setPlaying(true);
  }, []);

  /** A chapter starts at a slightly different second in each cut. */
  const playChapter = useCallback(
    (code: DemoLanguage, index: number) => {
      const cut = matchesNow(DESKTOP_MEDIA) ? 'desktop' : 'mobile';
      playFrom(DEMO_TRANSCRIPT[code].cuts[videoRef.current ? device : cut].starts[index] ?? 0);
    },
    [playFrom, device]
  );

  const films = DEMO_FILMS;
  const film = films[device];
  const cuts = DEMO_TRANSCRIPT[language].cuts;
  const phoneShape = `${cuts.mobile.width} / ${cuts.mobile.height}`;

  return (
    <UbBox
      as="section"
      id="demo"
      aria-labelledby="landing-demo-title"
      // The films walk through every module, so this section names them all.
      data-module-summary
      className={`${LANDING_SECTION} scroll-mt-24`}
    >
      <UbBox className={LANDING_CONTAINER}>
        <LandingSectionHeading
          id="landing-demo-title"
          eyebrow={t('landing.demo.eyebrow')}
          lead={t('landing.demo.lead')}
          keyLine={t('landing.demo.key')}
        />
        <UbText
          variant="inherit"
          tone="secondary"
          className="ds-body-l-regular mx-auto mt-4 max-w-[44rem] text-center"
        >
          {t('landing.demo.body')}
        </UbText>

        <UbReveal className="mx-auto mt-8 max-w-[64rem]">
          <UbBox
            className="relative mx-auto w-[min(100%,calc(70dvh*var(--demo-phone)))] overflow-clip rounded-[22px] border border-border-hairline bg-black shadow-[0_28px_70px_-40px_var(--device-glow)] [aspect-ratio:var(--demo-phone)] lg:w-full lg:[aspect-ratio:16/9]"
            style={{ '--demo-phone': phoneShape } as React.CSSProperties}
            data-demo-frame
          >
            {failed && (
              <UbStack
                gap={4}
                align="center"
                justify="center"
                className="absolute inset-0 bg-surface-card p-6 text-center"
                data-testid="landing-demo-unavailable"
              >
                <UbText variant="body" tone="secondary">
                  {t('landing.demo.unavailable')}
                </UbText>
                <UbActionLink
                  href={ROUTES.SIGNUP}
                  variant="primary"
                  size="lg"
                  className="rounded-[14px]"
                >
                  {t('landing.demo.unavailableCta')}
                </UbActionLink>
              </UbStack>
            )}
            {!failed && playing && (
              <video
                key={film.id}
                ref={(node) => {
                  videoRef.current = node;
                  if (node && startAt > 0 && node.currentTime === 0) node.currentTime = startAt;
                }}
                src={demoVideoUrl(film.id)}
                poster={film.poster.jpg}
                width={cuts[device].width}
                height={cuts[device].height}
                controls
                autoPlay
                playsInline
                preload="metadata"
                lang={DEMO_VOICE}
                aria-label={t('landing.demo.title')}
                onError={() => setFailed(true)}
                className="absolute inset-0 h-full w-full"
                data-testid="landing-demo-video"
              >
                {/* Captions in the voice's language, subtitles in the other;
                      the one that matches the page is on from the start. */}
                {LANGUAGES.map((code) => (
                  <track
                    key={code}
                    kind={code === DEMO_VOICE ? 'captions' : 'subtitles'}
                    src={film.tracks[code]}
                    srcLang={code}
                    label={t(`landing.demo.track.${code}`)}
                    default={code === language}
                  />
                ))}
              </video>
            )}
            {!failed && !playing && (
              <>
                {/* Both posters are in the HTML; CSS shows one. A lazy image
                      that is `display: none` is never fetched, so each screen
                      downloads only its own. */}
                <UbBox className="absolute inset-0 lg:hidden">
                  <UbPicture
                    webp={films.mobile.poster.webp}
                    jpg={films.mobile.poster.jpg}
                    alt=""
                    width={cuts.mobile.width}
                    height={cuts.mobile.height}
                    className="h-full w-full object-cover"
                  />
                </UbBox>
                <UbBox className="absolute inset-0 hidden lg:block">
                  <UbPicture
                    webp={films.desktop.poster.webp}
                    jpg={films.desktop.poster.jpg}
                    alt=""
                    width={cuts.desktop.width}
                    height={cuts.desktop.height}
                    className="h-full w-full object-cover"
                  />
                </UbBox>
                <UbBox
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent"
                />
                <UbButton
                  variant="primary"
                  size="lg"
                  onClick={() => playFrom(0)}
                  icon={<Play aria-hidden className="h-5 w-5 fill-current" />}
                  className="absolute left-1/2 top-1/2 h-14 -translate-x-1/2 -translate-y-1/2 rounded-pill px-7 text-[1.0625rem] shadow-[0_18px_40px_-12px_rgb(0_0_0/0.55)]"
                  data-testid="landing-demo-play"
                >
                  {t('landing.demo.play')}
                </UbButton>
                <UbText
                  as="span"
                  variant="inherit"
                  className="ds-num-s-semibold absolute bottom-3 right-3 rounded-pill bg-black/70 px-2.5 py-1 text-white"
                >
                  <UbText as="span" variant="inherit" className="lg:hidden">
                    {demoClock(cuts.mobile.durationSeconds)}
                  </UbText>
                  <UbText as="span" variant="inherit" className="hidden lg:inline">
                    {demoClock(cuts.desktop.durationSeconds)}
                  </UbText>
                </UbText>
              </>
            )}
          </UbBox>

          {LANGUAGES.map((code) => {
            const words = DEMO_TRANSCRIPT[code];
            return (
              <UbStack
                key={code}
                gap={4}
                // The attribute AND the class: `hidden` alone loses to the
                // stack's own `display: flex`, and both languages showed.
                hidden={code !== language}
                lang={code}
                data-demo-language={code}
                className={cn('mt-6', code !== language && 'hidden')}
              >
                <UbStack gap={3}>
                  <UbText
                    as="h3"
                    variant="inherit"
                    className="ds-body-s-semibold text-text-tertiary"
                  >
                    {t('landing.demo.chapters')}
                  </UbText>
                  <UbStack as="ol" direction="row" wrap gap={2}>
                    {words.chapters.map((chapter, index) => (
                      <UbBox as="li" key={chapter.id}>
                        <UbButton
                          variant="outlineNeutral"
                          size="md"
                          onClick={() => playChapter(code, index)}
                          className="h-11 gap-2 rounded-pill px-4"
                        >
                          <UbText
                            as="span"
                            variant="inherit"
                            className="ds-num-s-semibold text-text-accent"
                          >
                            {demoClock(words.cuts.desktop.starts[index] ?? 0)}
                          </UbText>
                          {t(`landing.demo.chapter.${index + 1}`)}
                        </UbButton>
                      </UbBox>
                    ))}
                  </UbStack>
                </UbStack>

                <UbDisclosure
                  size="lg"
                  keepMounted
                  label={`${t('landing.demo.transcript')} (${t(`landing.demo.lang.${code}`)})`}
                  className="rounded-[18px] bg-surface-card"
                >
                  <UbStack gap={5}>
                    {words.chapters.map((chapter, index) => (
                      <UbStack key={chapter.id} gap={2}>
                        <UbText
                          as="h4"
                          variant="inherit"
                          className="ds-body-base-semibold text-text-primary"
                        >
                          {demoClock(words.cuts.desktop.starts[index] ?? 0)} ·{' '}
                          {t(`landing.demo.chapter.${index + 1}`)}
                        </UbText>
                        {chapter.paragraphs.map((paragraph) => (
                          <UbText
                            key={paragraph.slice(0, 32)}
                            variant="inherit"
                            tone="secondary"
                            className="ds-body-base-regular"
                          >
                            {paragraph}
                          </UbText>
                        ))}
                      </UbStack>
                    ))}
                    <UbText variant="caption" tone="tertiary">
                      {t('landing.demo.voiceNote')}
                    </UbText>
                  </UbStack>
                </UbDisclosure>
              </UbStack>
            );
          })}
        </UbReveal>
      </UbBox>
    </UbBox>
  );
}

DemoSectionBase.displayName = 'DemoSection';
export const DemoSection = memo(DemoSectionBase);
