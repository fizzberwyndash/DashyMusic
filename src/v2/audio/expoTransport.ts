import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import type { AudioItem } from '../types';
import type { AudioTransport, TransportStatus } from './queueEngine';
import { clamp } from './math';

export class ExpoAudioTransport implements AudioTransport {
  private player: AudioPlayer;
  private listeners = new Set<() => void>();
  private disposed = false;
  private statusListener: { remove(): void };
  private loadedResolve: (() => void) | null = null;
  private loadedReject: ((error: Error) => void) | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private ended = false;

  constructor() {
    this.player = createAudioPlayer(null, { updateInterval: 200, keepAudioSessionActive: true, preferredForwardBufferDuration: 15 });
    this.player.volume = 0;
    this.statusListener = this.player.addListener('playbackStatusUpdate', status => {
      this.ended = status.didJustFinish || (this.ended && !status.playing && status.currentTime >= status.duration);
      if (status.isLoaded) this.finishLoad();
      if (status.error) this.finishLoad(new Error('The audio stream is unavailable.'));
      this.notify();
    });
  }

  async load(item: AudioItem): Promise<void> {
    const ready = new Promise<void>((resolve, reject) => {
      this.loadedResolve = resolve; this.loadedReject = reject;
      this.loadTimer = setTimeout(() => { this.finishLoad(new Error('The audio stream took too long to load.')); }, 25_000);
    });
    this.ended = false;
    this.player.replace({ uri: item.url, name: item.title });
    return ready;
  }

  private finishLoad(error?: Error): void {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.loadTimer = null;
    if (error) this.loadedReject?.(error); else this.loadedResolve?.();
    this.loadedResolve = null; this.loadedReject = null;
  }

  async play(): Promise<void> { if (!this.disposed) { this.ended = false; this.player.play(); } }
  pause(): void { if (!this.disposed) this.player.pause(); }
  async seek(seconds: number): Promise<void> { if (!this.disposed) { this.ended = false; await this.player.seekTo(seconds); } }
  volume(value: number): void { if (!this.disposed) this.player.volume = clamp(value, 0, 1); }
  status(): TransportStatus {
    const status = this.player.currentStatus;
    return {
      position: Math.max(0, status.currentTime || 0), duration: Math.max(0, status.duration || 0),
      playing: status.playing, buffering: status.isBuffering, loaded: status.isLoaded,
      ended: this.ended, error: status.error ? 'The audio stream is unavailable.' : null,
    };
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private notify(): void { if (!this.disposed) for (const listener of this.listeners) listener(); }
  activateMetadata(item: AudioItem): void {
    if (this.disposed) return;
    try {
      this.player.setActiveForLockScreen(true, { title: item.title, artist: item.artist, artworkUrl: item.artwork || undefined }, { showSeekBackward: true, showSeekForward: true });
    } catch { /* Availability differs in Expo Go and older devices. Native builds use DashyAudio. */ }
  }
  dispose(): void {
    if (this.disposed) return;
    this.listeners.clear(); this.statusListener.remove();
    this.finishLoad(new Error('The audio source changed.'));
    this.player.pause();
    // clearLockScreenControls only clears this player if it is currently registered.
    try { this.player.clearLockScreenControls(); } catch { /* Unsupported environment. */ }
    this.player.remove(); this.disposed = true;
  }
}
