import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { playerError, playerState, type YouTubePlayerHandle, type YouTubePlayerProps } from './playerTypes';

export type { YouTubePlayerHandle, YouTubePlayerProps } from './playerTypes';

type IFramePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
};
type PlayerOptions = {
  width: string;
  height: string;
  videoId: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady(): void;
    onStateChange(event: { data: number }): void;
    onError(event: { data: number }): void;
  };
};
type YouTubeAPI = { Player: new (element: HTMLElement, options: PlayerOptions) => IFramePlayer };
declare global {
  interface Window {
    YT?: YouTubeAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeAPI> | undefined;
function loadAPI(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeAPI>((resolve, reject) => {
    let settled = false;
    const existing = document.querySelector<HTMLScriptElement>('script[data-dashy-youtube]');
    const script = existing ?? document.createElement('script');
    const previous = window.onYouTubeIframeAPIReady;
    const restoreCallback = () => {
      // A later integration may have installed another callback; leave it intact.
      if (window.onYouTubeIframeAPIReady !== onReady) return;
      if (previous) window.onYouTubeIframeAPIReady = previous;
      else delete window.onYouTubeIframeAPIReady;
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.onerror = null;
      restoreCallback();
      if (error) {
        // Only the script marked as ours is removed, allowing a real retry.
        script.remove();
        reject(error);
      } else if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube could not initialize its player.'));
    };
    const onReady = () => {
      if (settled) return;
      finish(window.YT?.Player ? undefined : new Error('YouTube could not initialize its player.'));
      // Preserve another client's readiness callback without letting its failure
      // prevent this player's own readiness from settling.
      try { previous?.(); } catch { /* Another integration owns its callback errors. */ }
    };
    const timeout = window.setTimeout(() => finish(new Error('YouTube is taking too long to load. Check your connection, then close and reopen the player.')), 20000);
    window.onYouTubeIframeAPIReady = onReady;
    script.onerror = () => finish(new Error('Could not reach YouTube. Check your connection, then close and reopen the player.'));
    if (!existing) {
      script.src = 'https://www.youtube.com/iframe_api';
      script.dataset.dashyYoutube = 'true';
      document.head.appendChild(script);
    }
  }).catch(error => { apiPromise = undefined; throw error; });
  return apiPromise;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(function YouTubePlayer(props, ref) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<IFramePlayer | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;

  useImperativeHandle(ref, () => ({
    play: () => player.current?.playVideo?.(),
    pause: () => player.current?.pauseVideo?.(),
    seekTo: seconds => player.current?.seekTo?.(Math.max(0, Number.isFinite(seconds) ? seconds : 0), true),
  }), []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let readyTimeout: number | undefined;
    let ready = false;
    let failed = false;
    const fail = (message: string) => {
      if (cancelled || failed) return;
      failed = true;
      window.clearTimeout(readyTimeout);
      window.clearInterval(timer);
      player.current?.pauseVideo?.();
      callbacks.current.onError?.(message);
    };
    const progress = () => {
      if (cancelled || failed) return;
      const current = player.current;
      if (typeof current?.getCurrentTime !== 'function') return;
      const seconds = current.getCurrentTime();
      const duration = current.getDuration();
      if (Number.isFinite(seconds) && Number.isFinite(duration)) callbacks.current.onProgress?.(Math.max(0, seconds), Math.max(0, duration));
    };
    const hidden = () => { if (document.hidden) player.current?.pauseVideo?.(); };
    document.addEventListener('visibilitychange', hidden);
    const host = document.createElement('div');
    container.current?.appendChild(host);

    loadAPI().then(api => {
      if (cancelled || !container.current) return;
      readyTimeout = window.setTimeout(() => fail('The YouTube video is taking too long to load. Check your connection, then close and reopen the player.'), 20000);
      player.current = new api.Player(host, {
        width: '100%', height: '100%', videoId: props.videoId,
        playerVars: { autoplay: 0, controls: 1, playsinline: 1, cc_load_policy: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: () => {
            if (cancelled || failed || ready) return;
            ready = true;
            window.clearTimeout(readyTimeout);
            const iframe = player.current?.getIframe();
            if (iframe) {
              iframe.title = 'YouTube music video player';
              iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
              iframe.style.display = 'block';
              iframe.style.border = '0';
            }
            callbacks.current.onReady?.();
            progress();
            timer = window.setInterval(progress, 500);
          },
          onStateChange: event => {
            if (cancelled || failed) return;
            const state = playerState(event.data);
            if (state) callbacks.current.onStateChange?.(state);
            progress();
          },
          onError: event => fail(playerError(event.data)),
        },
      });
    }).catch(error => fail(error instanceof Error ? error.message : 'Could not load YouTube.'));

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(readyTimeout);
      document.removeEventListener('visibilitychange', hidden);
      player.current?.destroy();
      player.current = null;
      host.remove();
    };
  }, [props.videoId]);

  return <div ref={container} style={{ width: '100%', aspectRatio: '16 / 9', minHeight: 200, background: '#000', overflow: 'hidden' }} />;
});

export default YouTubePlayer;
