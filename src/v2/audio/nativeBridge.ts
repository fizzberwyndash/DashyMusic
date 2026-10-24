import type { AudioItem, AudioSettings, AudioSnapshot, MusicEngine } from '../types';
import { emptySnapshot } from '../types';
import { normalizeSettings, validateAudioItem } from './math';

export type NativeAudioModule = {
  setQueue(items: AudioItem[], index: number, settings: AudioSettings): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  setSettings(settings: AudioSettings): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<AudioSnapshot>;
  addListener(event: 'onState', listener: (snapshot: AudioSnapshot) => void): { remove(): void };
};

export function createNativeEngine(module: NativeAudioModule): MusicEngine {
  let state: AudioSnapshot = { ...emptySnapshot, queueIds: [] };
  let disposed = false;
  let observedEvent = false;
  const listeners = new Set<(snapshot: AudioSnapshot) => void>();
  const subscription = module.addListener('onState', snapshot => {
    if (disposed) return;
    observedEvent = true;
    state = snapshot;
    for (const listener of listeners) listener(state);
  });
  void module.getState().then(snapshot => {
    if (disposed || observedEvent) return;
    state = snapshot;
    for (const listener of listeners) listener(state);
  }).catch(() => {});
  const ensureAlive = () => { if (disposed) throw new Error('The audio player has been closed.'); };
  return {
    kind: 'native',
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
    async setQueue(items, index, settings) { ensureAlive(); await module.setQueue(items.map(validateAudioItem), index, normalizeSettings(settings)); },
    async play() { ensureAlive(); await module.play(); },
    async pause() { ensureAlive(); await module.pause(); },
    async seek(seconds) { ensureAlive(); if (Number.isFinite(seconds)) await module.seek(Math.max(0, seconds)); },
    async next() { ensureAlive(); await module.next(); },
    async previous() { ensureAlive(); await module.previous(); },
    async setSettings(settings) { ensureAlive(); await module.setSettings(normalizeSettings(settings)); },
    async stop() { ensureAlive(); await module.stop(); },
    dispose() {
      if (disposed) return;
      disposed = true; subscription.remove(); listeners.clear();
      void module.stop().catch(() => {});
    },
  };
}
