export type YouTubePlayerState = 'playing' | 'paused' | 'ended' | 'buffering';

export interface YouTubePlayerHandle {
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
}

export interface YouTubePlayerProps {
  videoId: string;
  onReady?: () => void;
  onStateChange?: (state: YouTubePlayerState) => void;
  onProgress?: (currentTime: number, duration: number) => void;
  onError?: (message: string) => void;
}

export type PlayerMessage =
  | { type: 'ready' | 'network-error' | 'ready-timeout' }
  | { type: 'state'; state: number }
  | { type: 'error'; code: number }
  | { type: 'progress'; time: number; duration: number };

/** Treat the WebView bridge as untrusted JSON, including valid JSON primitives. */
export function parsePlayerMessage(raw: string): PlayerMessage | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  const finite = (item: unknown): item is number => typeof item === 'number' && Number.isFinite(item);
  switch (message.type) {
    case 'ready': case 'network-error': case 'ready-timeout': return { type: message.type };
    case 'state': return finite(message.state) ? { type: 'state', state: message.state } : null;
    case 'error': return finite(message.code) ? { type: 'error', code: message.code } : null;
    case 'progress': return finite(message.time) && finite(message.duration) ? { type: 'progress', time: message.time, duration: message.duration } : null;
    default: return null;
  }
}

export const playerState = (code: number): YouTubePlayerState | undefined => {
  switch (code) {
    case 0: return 'ended';
    case 1: return 'playing';
    case 2: return 'paused';
    case 3: return 'buffering';
    default: return undefined;
  }
};

export const playerError = (code: number): string => {
  switch (code) {
    case 2: return 'This YouTube video link is invalid. Try another video.';
    case 5: return 'YouTube could not play this video on this device. Try another video.';
    case 100: return 'This video is private, unavailable, or has been removed.';
    case 101:
    case 150: return 'The owner does not allow this video to play in other apps. Try another video or open it in YouTube.';
    case 153: return 'YouTube could not identify this player. Configure a valid EXPO_PUBLIC_PLAYER_ORIGIN and restart the app, or open the video in YouTube.';
    default: return 'YouTube could not play this video. Check your connection or try another video.';
  }
};
