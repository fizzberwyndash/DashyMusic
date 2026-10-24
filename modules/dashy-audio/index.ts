import { requireOptionalNativeModule } from 'expo-modules-core';
import type { AudioItem, AudioSettings, AudioSnapshot } from '../../src/v2/types';

export type NativeDashyAudioModule = {
  setQueue(items: AudioItem[], index: number, settings: AudioSettings): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  setSettings(settings: AudioSettings): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<AudioSnapshot>;
  addListener(event: 'onState', listener: (state: AudioSnapshot) => void): { remove(): void };
};

/** Expo Go has no custom module; its preview uses the separate Expo Audio facade. */
export function getDashyAudioModule(): NativeDashyAudioModule | null {
  return requireOptionalNativeModule<NativeDashyAudioModule>('DashyAudio');
}
