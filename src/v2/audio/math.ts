import type { AudioItem, AudioSettings, FadeCurve } from '../types';
import { defaultAudioSettings } from '../types';

export function clamp(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : minimum;
}

export function normalizeSettings(value: AudioSettings): AudioSettings {
  return {
    crossfadeSeconds: clamp(value.crossfadeSeconds, 0, 12),
    fadeInSeconds: clamp(value.fadeInSeconds, 0, 3),
    fadeOutSeconds: clamp(value.fadeOutSeconds, 0, 3),
    curve: value.curve === 'linear' ? 'linear' : 'equalPower',
    repeat: ['off', 'all', 'one'].includes(value.repeat) ? value.repeat : defaultAudioSettings.repeat,
    sleepAt: typeof value.sleepAt === 'number' && Number.isFinite(value.sleepAt) && value.sleepAt > 0 ? value.sleepAt : null,
  };
}

export function crossfadeGains(progress: number, curve: FadeCurve): { outgoing: number; incoming: number } {
  const p = clamp(progress, 0, 1);
  return curve === 'linear'
    ? { outgoing: 1 - p, incoming: p }
    : { outgoing: Math.cos(p * Math.PI / 2), incoming: Math.sin(p * Math.PI / 2) };
}

/** URLs are supplied by our licensed catalog or the device file importer, never an extracted video. */
export function validateAudioItem(item: AudioItem): AudioItem {
  if (!item || typeof item.id !== 'string' || !item.id || typeof item.url !== 'string') {
    throw new Error('This track has no playable audio source.');
  }
  let url: URL;
  try { url = new URL(item.url); } catch { throw new Error('This track has an invalid audio source.'); }
  if (!['https:', 'file:', 'content:', 'blob:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only secure music streams and imported audio files can be played.');
  }
  if (['youtube.com', 'youtu.be', 'youtube-nocookie.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error('YouTube videos must use the visible YouTube player.');
  }
  return {
    id: item.id,
    url: item.url,
    title: typeof item.title === 'string' ? item.title : 'Untitled track',
    artist: typeof item.artist === 'string' ? item.artist : 'Unknown artist',
    artwork: typeof item.artwork === 'string' ? item.artwork : '',
    duration: clamp(item.duration, 0, 86_400),
  };
}
