/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultAudioSettings, emptySnapshot, type AudioItem, type AudioSettings, type AudioSnapshot } from '../src/v2/types';
import { crossfadeGains, normalizeSettings, validateAudioItem } from '../src/v2/audio/math';
import { QueueMusicEngine, STREAM_ERROR, type AudioTransport, type TransportStatus } from '../src/v2/audio/queueEngine';
import { createNativeEngine, type NativeAudioModule } from '../src/v2/audio/nativeBridge';

const tracks: AudioItem[] = ['one', 'two', 'three'].map(id => ({ id, url: `https://music.example/${id}.mp3`, title: id, artist: 'Original test artist', artwork: '', duration: 100 }));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

class FakeTransport implements AudioTransport {
  item: AudioItem | null = null;
  state: TransportStatus = { position: 0, duration: 0, loaded: false, playing: false, buffering: false, ended: false, error: null };
  gain = 0;
  disposed = false;
  playError: Error | null = null;
  deferredLoad = false;
  rejectLoad: ((error: Error) => void) | null = null;
  callbacks = new Set<() => void>();
  async load(item: AudioItem) {
    this.item = item; this.state.duration = item.duration;
    if (this.deferredLoad) return new Promise<void>((_, reject) => { this.rejectLoad = reject; });
    this.patch({ loaded: true });
  }
  async play() { if (this.playError) throw this.playError; this.patch({ playing: true, ended: false }); }
  pause() { this.patch({ playing: false }); }
  async seek(position: number) { this.patch({ position, ended: false }); }
  volume(gain: number) { this.gain = gain; }
  status() { return { ...this.state }; }
  subscribe(callback: () => void) { this.callbacks.add(callback); return () => this.callbacks.delete(callback); }
  dispose() { this.disposed = true; this.patch({ playing: false }); this.callbacks.clear(); }
  patch(state: Partial<TransportStatus>) { Object.assign(this.state, state); for (const callback of this.callbacks) callback(); }
}

function harness(settings: Partial<AudioSettings> = {}, deferred = false) {
  const transports: FakeTransport[] = [];
  const clocks = new Set<() => void>();
  let now = 10_000;
  const engine = new QueueMusicEngine('web', () => { const transport = new FakeTransport(); transport.deferredLoad = deferred; transports.push(transport); return transport; }, { ...defaultAudioSettings, ...settings }, {
    now: () => now,
    every: callback => { clocks.add(callback); return callback; },
    cancel: handle => { clocks.delete(handle as () => void); },
  });
  let snapshot: AudioSnapshot = { ...emptySnapshot };
  engine.subscribe(next => { snapshot = next; });
  return {
    engine, transports, snapshot: () => snapshot,
    tick(milliseconds = 200) { now += milliseconds; for (const callback of [...clocks]) callback(); },
    activeTimers: () => clocks.size,
    settings: { ...defaultAudioSettings, ...settings },
  };
}

test('audio validation prevents hidden YouTube playback and rejects insecure or executable URLs', () => {
  for (const url of ['http://music.example/a.mp3', 'javascript:alert(1)', 'https://user:password@music.example/a.mp3', 'https://www.youtube.com/watch?v=JGwWNGJdvx8', 'https://youtu.be/JGwWNGJdvx8']) {
    assert.throws(() => validateAudioItem({ ...tracks[0], url }));
  }
  for (const url of ['https://music.example/a.mp3', 'file:///private/music.m4a', 'blob:https://dashy.example/asset', 'content://audio/1']) {
    assert.equal(validateAudioItem({ ...tracks[0], url }).url, url);
  }
});

test('crossfade curves preserve equal power and settings clamp invalid values', () => {
  for (const progress of [0, 0.1, 0.5, 0.75, 1]) {
    const gain = crossfadeGains(progress, 'equalPower');
    assert.ok(Math.abs(gain.outgoing ** 2 + gain.incoming ** 2 - 1) < 1e-12);
  }
  assert.deepEqual(crossfadeGains(0.5, 'linear'), { outgoing: 0.5, incoming: 0.5 });
  assert.deepEqual(normalizeSettings({ ...defaultAudioSettings, crossfadeSeconds: 999, fadeInSeconds: -8, fadeOutSeconds: NaN, sleepAt: Infinity }), { ...defaultAudioSettings, crossfadeSeconds: 12, fadeInSeconds: 0, fadeOutSeconds: 0, sleepAt: null });
});

test('queue prepares silently and preserves a browser play gesture without waiting for media loading', async () => {
  const h = harness({}, true);
  await h.engine.setQueue(tracks, 0, h.settings);
  assert.equal(h.transports.length, 2);
  assert.equal(h.snapshot().playing, false);
  assert.equal(h.snapshot().buffering, true);
  await h.engine.play();
  assert.equal(h.transports[0].state.playing, true);
  assert.equal(h.transports[1].state.playing, false);
  h.engine.dispose();
});

test('equal-power AutoMix overlaps two real transports and retires the outgoing one', async () => {
  const h = harness();
  await h.engine.setQueue(tracks, 0, h.settings); await h.engine.play();
  h.transports[0].patch({ position: 95 }); await flush();
  assert.equal(h.snapshot().activeId, 'two');
  assert.deepEqual(h.snapshot().transition, { fromId: 'one', toId: 'two', progress: 0 });
  assert.equal(h.transports.filter(item => item.state.playing).length, 2);
  h.transports[1].patch({ position: 3 }); h.tick();
  assert.ok(Math.abs(h.transports[0].gain - Math.SQRT1_2) < 1e-10);
  assert.ok(Math.abs(h.transports[1].gain - Math.SQRT1_2) < 1e-10);
  h.transports[1].patch({ position: 6.1 }); h.tick();
  assert.equal(h.transports[0].disposed, true);
  assert.equal(h.snapshot().transition, null);
  assert.equal(h.transports.filter(item => item.state.playing).length, 1);
  h.engine.dispose();
});

test('pause and seek during an overlap cannot leave the outgoing song audible', async () => {
  const h = harness();
  await h.engine.setQueue(tracks, 0, h.settings); await h.engine.play();
  h.transports[0].patch({ position: 95 }); await flush();
  h.transports[1].patch({ position: 2 });
  await h.engine.pause();
  assert.equal(h.transports.filter(item => item.state.playing).length, 0);
  assert.equal(h.activeTimers(), 0);
  await h.engine.seek(30);
  assert.equal(h.transports[0].disposed, true);
  assert.equal(h.snapshot().transition, null);
  assert.equal(h.snapshot().position, 30);
  await h.engine.play();
  assert.equal(h.transports.filter(item => item.state.playing).length, 1);
  h.engine.dispose();
});

test('manual skipping midway through a fade releases both older players', async () => {
  const h = harness();
  await h.engine.setQueue(tracks, 0, h.settings); await h.engine.play();
  h.transports[0].patch({ position: 95 }); await flush();
  await h.engine.next();
  assert.equal(h.snapshot().activeId, 'three');
  assert.equal(h.transports[0].disposed, true);
  assert.equal(h.transports[1].disposed, true);
  assert.equal(h.transports.filter(item => item.state.playing).length, 1);
  h.engine.dispose();
});

test('sleep timer fades and stops playback, and play after expiry starts a fresh session', async () => {
  const h = harness({ sleepAt: 11_000, fadeInSeconds: 0 });
  await h.engine.setQueue(tracks, 0, h.settings); await h.engine.play();
  h.transports[0].patch({ position: 10 });
  h.tick(500);
  assert.ok(h.transports[0].gain > 0 && h.transports[0].gain < 0.5);
  h.tick(500);
  assert.equal(h.snapshot().playing, false);
  assert.equal(h.transports[0].state.playing, false);
  assert.equal(h.activeTimers(), 0);
  await h.engine.play();
  assert.equal(h.snapshot().playing, true);
  assert.equal(h.transports[0].gain, 1);
  h.engine.dispose();
});

test('repeat-one restarts its current song; an off queue stops at the last track', async () => {
  const repeat = harness({ repeat: 'one', crossfadeSeconds: 0 });
  await repeat.engine.setQueue(tracks.slice(0, 1), 0, repeat.settings); await repeat.engine.play();
  repeat.transports[0].patch({ position: 100, ended: true, playing: false }); await flush();
  assert.equal(repeat.snapshot().activeId, 'one');
  assert.equal(repeat.snapshot().position, 0);
  assert.equal(repeat.snapshot().playing, true);
  repeat.engine.dispose();
  const once = harness({ crossfadeSeconds: 0 });
  await once.engine.setQueue(tracks.slice(0, 1), 0, once.settings); await once.engine.play();
  once.transports[0].patch({ position: 100, ended: true, playing: false }); await flush();
  assert.equal(once.snapshot().playing, false);
  assert.equal(once.activeTimers(), 0);
  once.engine.dispose();
});

test('a preloader failure keeps the current song playing and reports failure only when needed', async () => {
  const h = harness();
  await h.engine.setQueue(tracks, 0, h.settings); await h.engine.play();
  h.transports[1].patch({ error: 'unavailable', loaded: false });
  assert.equal(h.snapshot().playing, true);
  assert.equal(h.snapshot().error, null);
  h.transports[0].patch({ position: 100, ended: true, playing: false }); await flush();
  assert.equal(h.snapshot().error, STREAM_ERROR);
  assert.equal(h.snapshot().playing, false);
  h.engine.dispose();
});

test('stale loading failures after a queue change cannot corrupt the new queue', async () => {
  const h = harness({}, true);
  await h.engine.setQueue(tracks, 0, h.settings);
  const stale = h.transports[0];
  await h.engine.setQueue([tracks[2]], 0, h.settings);
  stale.rejectLoad?.(new Error('late network failure')); await flush();
  assert.equal(h.snapshot().activeId, 'three');
  assert.equal(h.snapshot().error, null);
  assert.equal(stale.disposed, true);
  h.engine.dispose();
});

test('a failed play request publishes a useful error and disposes all active audio cleanly', async () => {
  const h = harness();
  await h.engine.setQueue(tracks, 0, h.settings);
  h.transports[0].playError = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
  await assert.rejects(h.engine.play(), /Tap Play again/);
  assert.match(h.snapshot().error ?? '', /Tap Play again/);
  assert.equal(h.snapshot().playing, false);
  h.engine.dispose();
  assert.ok(h.transports.every(item => item.disposed && !item.state.playing));
  assert.equal(h.activeTimers(), 0);
});

test('native adapter ignores a stale initial getState after a newer native event and removes its listener on dispose', async () => {
  let emit: ((state: AudioSnapshot) => void) | undefined;
  let resolveState: ((state: AudioSnapshot) => void) | undefined;
  let removed = false;
  let stopped = 0;
  const module: NativeAudioModule = {
    async setQueue() {}, async play() {}, async pause() {}, async seek() {}, async next() {}, async previous() {}, async setSettings() {},
    async stop() { stopped += 1; },
    getState: () => new Promise(resolve => { resolveState = resolve; }),
    addListener(_event, listener) { emit = listener; return { remove() { removed = true; } }; },
  };
  const engine = createNativeEngine(module);
  let latest = { ...emptySnapshot };
  engine.subscribe(state => { latest = state; });
  emit?.({ ...emptySnapshot, activeId: 'newest', playing: true });
  resolveState?.({ ...emptySnapshot, activeId: 'stale' }); await flush();
  assert.equal(latest.activeId, 'newest');
  engine.dispose(); await flush();
  assert.equal(removed, true); assert.equal(stopped, 1);
});
