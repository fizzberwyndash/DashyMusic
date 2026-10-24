export type MusicSource = 'audius' | 'local' | 'youtube';

export type MusicTrack = {
  id: string;
  providerId: string;
  source: MusicSource;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  streamUrl?: string;
  permalink?: string;
  genre?: string;
  importedAt?: number;
};

export type FadeCurve = 'equalPower' | 'linear';
export type RepeatMode = 'off' | 'all' | 'one';
export type AudioSettings = {
  crossfadeSeconds: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  curve: FadeCurve;
  repeat: RepeatMode;
  sleepAt: number | null;
};

export const defaultAudioSettings: AudioSettings = {
  crossfadeSeconds: 6,
  fadeInSeconds: 0.8,
  fadeOutSeconds: 1.2,
  curve: 'equalPower',
  repeat: 'off',
  sleepAt: null,
};

export type AudioItem = {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
};

export type AudioSnapshot = {
  activeId: string | null;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  queueIds: string[];
  error: string | null;
  transition: { fromId: string; toId: string; progress: number } | null;
};

export const emptySnapshot: AudioSnapshot = {
  activeId: null, playing: false, buffering: false, position: 0, duration: 0,
  queueIds: [], error: null, transition: null,
};

export type MusicEngine = {
  kind: 'native' | 'expo' | 'web';
  subscribe(listener: (snapshot: AudioSnapshot) => void): () => void;
  setQueue(items: AudioItem[], index: number, settings: AudioSettings): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  setSettings(settings: AudioSettings): Promise<void>;
  stop(): Promise<void>;
  dispose(): void;
};

export type SavedPlaylist = {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  createdAt: number;
};

export type LibraryData = {
  version: 2;
  tracks: MusicTrack[];
  favoriteIds: string[];
  recentIds: string[];
  playlists: SavedPlaylist[];
  lyrics: Record<string, string>;
  audioSettings: AudioSettings;
  youtubeKey: string;
};
