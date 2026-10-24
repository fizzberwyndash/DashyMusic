import { defaultAudioSettings, type MusicEngine } from '../types';
import { QueueMusicEngine } from './queueEngine';
import { WebAudioTransport } from './webTransport';

export function createMusicEngine(): MusicEngine {
  const engine = new QueueMusicEngine('web', () => new WebAudioTransport(), defaultAudioSettings);
  let currentId: string | null = null;
  let disposed = false;
  const actions: MediaSessionAction[] = ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto', 'seekbackward', 'seekforward'];
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    const run = (command: Promise<void>) => { void command.catch(() => {}); };
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => run(engine.play()), pause: () => run(engine.pause()),
      nexttrack: () => run(engine.next()), previoustrack: () => run(engine.previous()),
      seekto: details => { if (typeof details.seekTime === 'number') run(engine.seek(details.seekTime)); },
      seekbackward: details => run(engine.seek(lastPosition - (details.seekOffset ?? 10))),
      seekforward: details => run(engine.seek(lastPosition + (details.seekOffset ?? 10))),
    };
    for (const action of actions) { try { navigator.mediaSession.setActionHandler(action, handlers[action] ?? null); } catch { /* Browser lacks this action. */ } }
  }
  let lastPosition = 0;
  const unsubscribe = engine.subscribe(snapshot => {
    if (disposed || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    lastPosition = snapshot.position;
    navigator.mediaSession.playbackState = snapshot.activeId ? snapshot.playing ? 'playing' : 'paused' : 'none';
    if (snapshot.duration > 0 && Number.isFinite(snapshot.duration)) {
      try { navigator.mediaSession.setPositionState({ duration: snapshot.duration, position: Math.min(snapshot.position, snapshot.duration), playbackRate: 1 }); } catch { /* Position state unsupported. */ }
    }
    if (snapshot.activeId !== currentId) {
      currentId = snapshot.activeId;
      if (!currentId) navigator.mediaSession.metadata = null;
    }
  });
  // Metadata is activated only for the selected transport, never the silent preloader.
  const originalSetQueue = engine.setQueue.bind(engine);
  const metadataTracks = new Map<string, { title: string; artist: string; artwork: string }>();
  let metadataId: string | null = null;
  const unsubscribeMetadata = engine.subscribe(snapshot => {
    if (disposed || typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const item = snapshot.activeId ? metadataTracks.get(snapshot.activeId) : null;
    if (!item || snapshot.activeId === metadataId) return;
    metadataId = snapshot.activeId;
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.artist, artwork: item.artwork ? [{ src: item.artwork }] : [] }); } catch { /* Artwork may be unavailable. */ }
  });
  engine.setQueue = async (items, index, settings) => {
    metadataTracks.clear();
    metadataId = null;
    for (const item of items) metadataTracks.set(item.id, item);
    await originalSetQueue(items, index, settings);
  };
  const dispose = engine.dispose.bind(engine);
  engine.dispose = () => {
    if (disposed) return;
    disposed = true; unsubscribe(); unsubscribeMetadata(); dispose();
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      for (const action of actions) { try { navigator.mediaSession.setActionHandler(action, null); } catch { /* Unsupported. */ } }
      navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none';
    }
  };
  return engine;
}
