import type { AudioItem } from '../types';
import type { AudioTransport, TransportStatus } from './queueEngine';
import { clamp } from './math';

export class WebAudioTransport implements AudioTransport {
  private audio: HTMLAudioElement;
  private listeners = new Set<() => void>();
  private error: string | null = null;
  private disposed = false;
  private buffering = true;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private loadResolve: (() => void) | null = null;
  private loadReject: ((reason: Error) => void) | null = null;
  private pendingSeeks = new Set<() => void>();
  private readonly changed = () => {
    if (this.audio.readyState >= 3 && !this.audio.seeking) this.buffering = false;
    if (this.audio.readyState >= 1) this.finishLoad();
    this.notify();
  };
  private readonly waiting = () => { this.buffering = true; this.notify(); };
  private readonly failed = () => {
    this.error = 'The audio stream is unavailable.';
    this.buffering = false;
    this.finishLoad(new Error(this.error));
    this.notify();
  };

  constructor(createAudio: () => HTMLAudioElement = () => new Audio()) {
    this.audio = createAudio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';
    this.audio.volume = 0;
    this.audio.setAttribute('playsinline', '');
    for (const event of ['loadedmetadata', 'canplay', 'playing', 'pause', 'timeupdate', 'durationchange', 'seeked', 'ended', 'progress']) this.audio.addEventListener(event, this.changed);
    for (const event of ['waiting', 'stalled', 'seeking']) this.audio.addEventListener(event, this.waiting);
    this.audio.addEventListener('error', this.failed);
  }

  async load(item: AudioItem): Promise<void> {
    if (this.disposed) throw new Error('The audio player is closed.');
    this.error = null;
    this.buffering = true;
    const loaded = new Promise<void>((resolve, reject) => {
      this.loadResolve = resolve;
      this.loadReject = reject;
      this.loadTimer = setTimeout(() => {
        this.error = 'The audio stream took too long to load.';
        this.buffering = false;
        this.finishLoad(new Error(this.error));
        this.notify();
      }, 25_000);
    });
    this.audio.src = item.url;
    this.audio.load();
    return loaded;
  }

  private finishLoad(error?: Error): void {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.loadTimer = null;
    if (error) this.loadReject?.(error); else this.loadResolve?.();
    this.loadResolve = null; this.loadReject = null;
  }

  async play(): Promise<void> {
    if (this.disposed) return;
    this.error = null;
    await this.audio.play();
  }

  pause(): void { if (!this.disposed) this.audio.pause(); }

  async seek(seconds: number): Promise<void> {
    if (this.disposed) return;
    const target = clamp(seconds, 0, Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : 86_400);
    if (this.audio.readyState >= 1) this.audio.currentTime = target;
    else await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('This audio stream could not seek yet.')); }, 10_000);
      const loaded = () => { cleanup(); if (!this.disposed) this.audio.currentTime = target; resolve(); };
      const failed = () => { cleanup(); reject(new Error('The audio stream is unavailable.')); };
      const cancel = () => { cleanup(); reject(new Error('The audio source changed.')); };
      const cleanup = () => { clearTimeout(timer); this.audio.removeEventListener('loadedmetadata', loaded); this.audio.removeEventListener('error', failed); this.pendingSeeks.delete(cancel); };
      this.pendingSeeks.add(cancel);
      this.audio.addEventListener('loadedmetadata', loaded, { once: true });
      this.audio.addEventListener('error', failed, { once: true });
    });
    this.notify();
  }

  volume(value: number): void { if (!this.disposed) this.audio.volume = clamp(value, 0, 1); }

  status(): TransportStatus {
    const duration = Number.isFinite(this.audio.duration) ? Math.max(0, this.audio.duration) : 0;
    return {
      position: Math.max(0, this.audio.currentTime || 0), duration,
      playing: !this.audio.paused && !this.audio.ended,
      buffering: this.buffering && !this.audio.ended,
      loaded: this.audio.readyState >= 1,
      ended: this.audio.ended,
      error: this.error,
    };
  }

  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private notify(): void { if (!this.disposed) for (const listener of this.listeners) listener(); }

  dispose(): void {
    if (this.disposed) return;
    this.listeners.clear();
    for (const cancel of [...this.pendingSeeks]) cancel();
    for (const event of ['loadedmetadata', 'canplay', 'playing', 'pause', 'timeupdate', 'durationchange', 'seeked', 'ended', 'progress']) this.audio.removeEventListener(event, this.changed);
    for (const event of ['waiting', 'stalled', 'seeking']) this.audio.removeEventListener(event, this.waiting);
    this.audio.removeEventListener('error', this.failed);
    this.finishLoad(new Error('The audio source changed.'));
    this.audio.pause();
    this.audio.removeAttribute('src'); this.audio.load();
    this.disposed = true;
  }
}
