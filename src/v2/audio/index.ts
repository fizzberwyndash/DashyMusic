import { requireOptionalNativeModule } from 'expo-modules-core';
import { setAudioModeAsync } from 'expo-audio';
import { defaultAudioSettings, type MusicEngine } from '../types';
import { createNativeEngine, type NativeAudioModule } from './nativeBridge';
import { QueueMusicEngine } from './queueEngine';
import { ExpoAudioTransport } from './expoTransport';

/** Expo Go previews audio with expo-audio; installed iOS builds load the native dual-player module. */
export function createMusicEngine(): MusicEngine {
  const module = requireOptionalNativeModule<NativeAudioModule>('DashyAudio');
  if (module) return createNativeEngine(module);
  const engine = new QueueMusicEngine('expo', () => new ExpoAudioTransport(), defaultAudioSettings);
  let mode: Promise<void> | null = null;
  const play = engine.play.bind(engine);
  engine.play = async () => {
    mode ??= setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'doNotMix',
    }).catch(error => { mode = null; throw error; });
    await mode;
    await play();
  };
  return engine;
}
