import { AudioItem, AudioSettings, AudioSnapshot, emptySnapshot, MusicEngine } from '../types';
import { clamp, crossfadeGains, normalizeSettings, validateAudioItem } from './math';

export type TransportStatus = {
  position: number;
  duration: number;
  playing: boolean;
  buffering: boolean;
  loaded: boolean;
  ended: boolean;
  error: string | null;
};

export interface AudioTransport {
  load(item: AudioItem): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): Promise<void>;
  volume(value: number): void;
  status(): TransportStatus;
  subscribe(listener: () => void): () => void;
  activateMetadata?(item: AudioItem): void;
  dispose(): void;
}

type Slot = {
  item: AudioItem;
  index: number;
  transport: AudioTransport;
  unsubscribe: () => void;
  loaded: boolean;
  error: string | null;
  hadStarted: boolean;
};

type Scheduler = {
  now(): number;
  every(callback: () => void, milliseconds: number): unknown;
  cancel(handle: unknown): void;
};

const realScheduler: Scheduler = {
  now: Date.now,
  every: (callback, milliseconds) => setInterval(callback, milliseconds),
  cancel: handle => clearInterval(handle as ReturnType<typeof setInterval>),
};

export const STREAM_ERROR = 'This audio stream could not be played. Check your connection, try another track, or open its source.';

/** Shared transport logic for browser and Expo Go. Installed iOS builds use the native engine. */
export class QueueMusicEngine implements MusicEngine {
  readonly kind: 'web' | 'expo';
  private listeners = new Set<(snapshot: AudioSnapshot) => void>();
  private slots = new Set<Slot>();
  private queue: AudioItem[] = [];
  private index = 0;
  private active: Slot | null = null;
  private prepared: Slot | null = null;
  private outgoing: Slot | null = null;
  private fadeSeconds = 0;
  private settings: AudioSettings;
  private intendedPlaying = false;
  private disposed = false;
  private generation = 0;
  private error: string | null = null;
  private transitionPending = false;
  private tickRunning = false;
  private commandDepth = 0;
  private timer: unknown = null;
  private lastPublished = -Infinity;

  constructor(
    kind: 'web' | 'expo',
    private readonly makeTransport: () => AudioTransport,
    settings: AudioSettings,
    private readonly scheduler: Scheduler = realScheduler,
  ) {
    this.kind = kind;
    this.settings = normalizeSettings(settings);
  }

  subscribe(listener: (snapshot: AudioSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  private snapshot(): AudioSnapshot {
    const status = this.active?.transport.status();
    const duration = this.duration(this.active);
    const progress = this.outgoing && this.fadeSeconds > 0
      ? clamp((status?.position ?? 0) / this.fadeSeconds, 0, 1) : 0;
    return {
      ...emptySnapshot,
      activeId: this.active?.item.id ?? null,
      playing: Boolean(this.intendedPlaying && status?.playing),
      buffering: Boolean(this.active && (status?.buffering || !this.active.loaded)),
      position: clamp(status?.position ?? 0, 0, duration || 86_400),
      duration,
      queueIds: this.queue.map(item => item.id),
      error: this.error,
      transition: this.outgoing && this.active
        ? { fromId: this.outgoing.item.id, toId: this.active.item.id, progress } : null,
    };
  }

  private duration(slot: Slot | null): number {
    if (!slot) return 0;
    const duration = slot.transport.status().duration;
    return Number.isFinite(duration) && duration > 0 ? duration : slot.item.duration;
  }

  private publish(force = false): void {
    if (this.disposed || (!force && this.scheduler.now() - this.lastPublished < 180)) return;
    this.lastPublished = this.scheduler.now();
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private keepTicking(): void {
    if (this.timer === null && !this.disposed) this.timer = this.scheduler.every(() => this.tick(), 40);
  }

  private stopTicking(): void {
    if (this.timer !== null) this.scheduler.cancel(this.timer);
    this.timer = null;
  }

  private createSlot(index: number, generation: number): Slot {
    const transport = this.makeTransport();
    const slot: Slot = {
      item: this.queue[index], index, transport, unsubscribe: () => {}, loaded: false, error: null, hadStarted: false,
    };
    this.slots.add(slot);
    slot.unsubscribe = transport.subscribe(() => {
      if (this.disposed || generation !== this.generation || !this.slots.has(slot)) return;
      const state = transport.status();
      if (state.loaded) slot.loaded = true;
      if (state.playing) slot.hadStarted = true;
      if (state.error) {
        slot.error = STREAM_ERROR;
        if (slot === this.active && this.error !== STREAM_ERROR) this.fail(STREAM_ERROR);
      } else if (slot === this.active && state.playing && !this.intendedPlaying && this.commandDepth === 0) {
        this.intendedPlaying = true;
        this.keepTicking();
      } else if (slot === this.active && this.intendedPlaying && this.commandDepth === 0 && !this.transitionPending && slot.hadStarted && state.loaded && !state.playing && !state.buffering && !state.ended) {
        // Reflect an OS/headphone/media-control pause; do not leave a fading second player audible.
        this.intendedPlaying = false;
        this.outgoing?.transport.pause();
        this.stopTicking();
      }
      this.tick();
      this.publish(true);
    });
    transport.volume(0);
    void transport.load(slot.item).then(() => {
      if (this.disposed || generation !== this.generation || !this.slots.has(slot)) return;
      slot.loaded = true;
      this.tick();
      this.publish(true);
    }).catch(() => {
      if (this.disposed || generation !== this.generation || !this.slots.has(slot)) return;
      slot.error = STREAM_ERROR;
      if (slot === this.active) this.fail(STREAM_ERROR);
    });
    return slot;
  }

  private release(slot: Slot | null): void {
    if (!slot || !this.slots.has(slot)) return;
    this.slots.delete(slot);
    slot.unsubscribe();
    slot.transport.pause();
    slot.transport.dispose();
  }

  private resetTransports(): void {
    this.active = null;
    this.prepared = null;
    this.outgoing = null;
    this.transitionPending = false;
    for (const slot of [...this.slots]) this.release(slot);
    this.stopTicking();
  }

  async setQueue(items: AudioItem[], index: number, settings: AudioSettings): Promise<void> {
    this.ensureAlive();
    const validated = items.map(validateAudioItem);
    if (validated.length && (!Number.isInteger(index) || index < 0 || index >= validated.length)) throw new Error('Choose a valid track in the queue.');
    this.generation += 1;
    this.intendedPlaying = false;
    this.resetTransports();
    this.queue = validated;
    this.index = index;
    this.settings = normalizeSettings(settings);
    this.error = null;
    if (validated.length) {
      this.active = this.createSlot(index, this.generation);
      this.active.transport.activateMetadata?.(this.active.item);
      this.prepareNext();
    }
    this.publish(true);
  }

  private nextIndex(automatic = true): number | null {
    if (!this.queue.length) return null;
    if (automatic && this.settings.repeat === 'one') return this.index;
    if (this.index + 1 < this.queue.length) return this.index + 1;
    return this.settings.repeat === 'all' ? 0 : null;
  }

  private prepareNext(): void {
    if (this.prepared || this.outgoing || this.disposed) return;
    const next = this.nextIndex();
    if (next !== null && next !== this.index) this.prepared = this.createSlot(next, this.generation);
  }

  async play(): Promise<void> {
    this.ensureAlive();
    if (!this.active) return;
    if (this.settings.sleepAt && this.settings.sleepAt <= this.scheduler.now()) this.settings.sleepAt = null;
    if (this.active.error) { this.error = this.active.error; this.publish(true); throw new Error(this.active.error); }
    if (this.active.transport.status().ended) await this.active.transport.seek(0);
    this.error = null;
    this.intendedPlaying = true;
    this.applyVolumes();
    const generation = this.generation;
    this.keepTicking();
    this.commandDepth += 1;
    try {
      // Call play before waiting for any loading promise, preserving browser user activation.
      const activePlay = this.active.transport.play();
      const outgoingPlay = this.outgoing?.transport.play();
      await activePlay;
      await outgoingPlay;
      if (generation === this.generation && !this.intendedPlaying) {
        this.active?.transport.pause();
        this.outgoing?.transport.pause();
      }
      if (generation === this.generation) this.publish(true);
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      const message = error instanceof Error && error.name === 'NotAllowedError'
        ? 'Tap Play again to allow audio in this browser.' : STREAM_ERROR;
      this.fail(message);
      throw new Error(message);
    } finally { this.commandDepth -= 1; }
  }

  async pause(): Promise<void> {
    if (this.disposed) return;
    this.intendedPlaying = false;
    this.active?.transport.pause();
    this.outgoing?.transport.pause();
    this.stopTicking();
    this.publish(true);
  }

  async seek(seconds: number): Promise<void> {
    this.ensureAlive();
    if (!this.active) return;
    const generation = this.generation;
    const current = this.active;
    this.release(this.outgoing); this.outgoing = null;
    this.transitionPending = false;
    this.commandDepth += 1;
    try { await current.transport.seek(clamp(seconds, 0, this.duration(current) || 86_400)); }
    catch (error) { if (generation === this.generation) throw error; }
    finally { this.commandDepth -= 1; }
    if (generation !== this.generation || this.active !== current) return;
    this.applyVolumes();
    this.prepareNext();
    this.publish(true);
  }

  private async jump(index: number): Promise<void> {
    const resume = this.intendedPlaying;
    const generation = this.generation + 1;
    await this.setQueue(this.queue, index, this.settings);
    if (resume && generation === this.generation) await this.play();
  }

  async next(): Promise<void> {
    this.ensureAlive();
    const next = this.nextIndex(false);
    if (next === null) await this.pause();
    else await this.jump(next);
  }

  async previous(): Promise<void> {
    this.ensureAlive();
    if (!this.active) return;
    if (this.active.transport.status().position > 3) { await this.seek(0); return; }
    const previous = this.index > 0 ? this.index - 1 : this.settings.repeat === 'all' ? this.queue.length - 1 : 0;
    await this.jump(previous);
  }

  async setSettings(settings: AudioSettings): Promise<void> {
    this.ensureAlive();
    const previousRepeat = this.settings.repeat;
    this.settings = normalizeSettings(settings);
    if (previousRepeat !== this.settings.repeat && this.prepared) { this.release(this.prepared); this.prepared = null; }
    this.prepareNext(); this.tick(); this.publish(true);
  }

  async stop(): Promise<void> {
    if (this.disposed) return;
    this.generation += 1;
    this.intendedPlaying = false;
    this.resetTransports();
    this.queue = []; this.index = 0; this.error = null;
    this.publish(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.generation += 1;
    this.intendedPlaying = false;
    this.resetTransports();
    this.disposed = true;
    this.listeners.clear();
  }

  private ensureAlive(): void {
    if (this.disposed) throw new Error('The audio player has been closed.');
  }

  private fail(message: string): void {
    this.error = message;
    this.intendedPlaying = false;
    this.active?.transport.pause();
    this.outgoing?.transport.pause();
    this.stopTicking();
    this.publish(true);
  }

  private applyVolumes(): void {
    if (!this.active) return;
    const status = this.active.transport.status();
    let master = 1;
    const sleepSeconds = this.settings.sleepAt ? (this.settings.sleepAt - this.scheduler.now()) / 1000 : Infinity;
    if (sleepSeconds < Math.max(1, this.settings.fadeOutSeconds)) master *= clamp(sleepSeconds / Math.max(1, this.settings.fadeOutSeconds), 0, 1);
    if (this.outgoing && this.fadeSeconds > 0) {
      const progress = clamp(status.position / this.fadeSeconds, 0, 1);
      const gains = crossfadeGains(progress, this.settings.curve);
      this.outgoing.transport.volume(gains.outgoing * master);
      this.active.transport.volume(gains.incoming * master);
    } else {
      const intro = this.settings.fadeInSeconds > 0 ? clamp(status.position / this.settings.fadeInSeconds, 0, 1) : 1;
      const remaining = this.duration(this.active) - status.position;
      const outro = this.settings.fadeOutSeconds > 0 && this.duration(this.active) > 0
        ? clamp(remaining / this.settings.fadeOutSeconds, 0, 1) : 1;
      // A prepared crossfade owns the outro once the incoming track starts.
      const hasUpcomingFade = this.prepared?.loaded && !this.prepared.error && this.settings.crossfadeSeconds > 0;
      this.active.transport.volume(master * intro * (hasUpcomingFade ? 1 : outro));
    }
  }

  private async beginTransition(incoming: Slot, seconds: number): Promise<void> {
    if (!this.active || this.transitionPending) return;
    this.transitionPending = true;
    const generation = this.generation;
    const outgoing = this.active;
    incoming.transport.volume(0);
    try {
      await incoming.transport.play();
      if (this.disposed || generation !== this.generation || this.active !== outgoing) { incoming.transport.pause(); return; }
      if (!this.intendedPlaying) { incoming.transport.pause(); return; }
      this.prepared = null;
      this.active = incoming;
      this.index = incoming.index;
      this.outgoing = outgoing;
      this.fadeSeconds = seconds;
      incoming.transport.activateMetadata?.(incoming.item);
      this.applyVolumes();
      this.publish(true);
    } catch {
      incoming.error = STREAM_ERROR;
      incoming.transport.pause();
      // Continue the current song. Its natural end will report a failed next source if still unavailable.
    } finally {
      if (generation === this.generation) this.transitionPending = false;
    }
  }

  private async advanceAtEnd(): Promise<void> {
    if (!this.active || this.transitionPending) return;
    const generation = this.generation;
    const current = this.active;
    const next = this.nextIndex();
    if (next === null) { void this.pause(); return; }
    if (next === this.index) {
      this.transitionPending = true;
      try {
        await current.transport.seek(0);
        if (generation === this.generation && this.active === current && this.intendedPlaying) await current.transport.play();
      }
      catch { if (generation === this.generation) this.fail(STREAM_ERROR); }
      finally { if (generation === this.generation) this.transitionPending = false; }
      return;
    }
    this.transitionPending = true;
    const resume = this.intendedPlaying;
    const incoming = this.prepared;
    if (incoming?.error) { this.fail(STREAM_ERROR); this.transitionPending = false; return; }
    if (incoming && incoming.index === next) {
      const outgoing = this.active;
      this.active = incoming; this.prepared = null; this.index = next;
      this.release(outgoing);
      incoming.transport.activateMetadata?.(incoming.item);
      this.applyVolumes();
      try { if (resume) await incoming.transport.play(); }
      catch { if (generation === this.generation) this.fail(STREAM_ERROR); }
      finally { if (generation === this.generation) { this.transitionPending = false; this.prepareNext(); this.publish(true); } }
    } else {
      try { await this.jump(next); }
      finally { if (generation === this.generation) this.transitionPending = false; }
    }
  }

  private tick(): void {
    if (this.tickRunning || this.disposed || !this.active) return;
    this.tickRunning = true;
    try {
      if (this.settings.sleepAt && this.scheduler.now() >= this.settings.sleepAt && this.intendedPlaying) {
        this.settings.sleepAt = null;
        void this.pause();
        return;
      }
      this.applyVolumes();
      const status = this.active.transport.status();
      if (!this.intendedPlaying) return;
      if (this.outgoing) {
        if (status.position >= this.fadeSeconds || status.ended) {
          this.release(this.outgoing); this.outgoing = null; this.fadeSeconds = 0;
          this.prepareNext(); this.applyVolumes();
        }
      }
      if (!this.outgoing && !this.transitionPending) {
        if (status.ended) void this.advanceAtEnd();
        else if (this.prepared?.loaded && !this.prepared.error && status.playing && this.settings.crossfadeSeconds > 0) {
          const duration = this.duration(this.active);
          const fade = Math.min(this.settings.crossfadeSeconds, duration / 2, this.duration(this.prepared) / 2);
          if (duration > 0 && fade > 0 && duration - status.position <= fade && status.position > 0) {
            void this.beginTransition(this.prepared, fade);
          }
        }
      }
      this.publish();
    } finally { this.tickRunning = false; }
  }
}
