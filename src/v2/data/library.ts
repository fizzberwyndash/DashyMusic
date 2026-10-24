import { parseLRC } from "../../lib/lyrics";
import { defaultAudioSettings } from "../types";
import type {
  AudioSettings,
  LibraryData,
  MusicTrack,
  SavedPlaylist,
} from "../types";
import { audiusStreamUrl, httpsUrl } from "./catalog";
import { youtubeTrackFromId } from "./providers";

export const LIBRARY_STORAGE_KEY = "dashy:library:v2";
const MAX_TRACKS = 1000;
const MAX_LYRICS_CHARACTERS = 2_000_000;
const MAX_STORED_CHARACTERS = 6_000_000;

export type LibraryStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export function defaultLibrary(): LibraryData {
  return {
    version: 2,
    tracks: [],
    favoriteIds: [],
    recentIds: [],
    playlists: [],
    lyrics: {},
    audioSettings: { ...defaultAudioSettings },
    youtubeKey: "",
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, fallback: string, max = 300): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
}

function nonnegative(value: unknown, maximum: number, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, value))
    : fallback;
}

export function isPrivateAudioFile(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 8192) return false;
  try {
    const url = new URL(value);
    const path = decodeURIComponent(url.pathname).toLowerCase();
    return (
      url.protocol === "file:" &&
      !url.hostname &&
      !url.username &&
      !url.password &&
      path.startsWith("/") &&
      !path.split("/").includes("..") &&
      (path.includes("/documents/") || path.includes("/files/"))
    );
  } catch {
    return false;
  }
}

export function sanitizeTrack(value: unknown): MusicTrack | null {
  const track = object(value);
  if (!track || typeof track.providerId !== "string") return null;
  const providerId = track.providerId;
  if (track.source === "youtube") {
    if (
      !/^[A-Za-z0-9_-]{11}$/.test(providerId) ||
      track.id !== `youtube:${providerId}`
    )
      return null;
    return youtubeTrackFromId(providerId);
  }
  if (
    !["audius", "local"].includes(String(track.source)) ||
    !/^[A-Za-z0-9_.-]{1,128}$/.test(providerId)
  )
    return null;
  const source = track.source as "audius" | "local";
  if (track.id !== `${source}:${providerId}`) return null;
  if (source === "audius" && !/^[A-Za-z0-9_-]{1,64}$/.test(providerId))
    return null;
  if (source === "local" && !isPrivateAudioFile(track.streamUrl)) return null;
  const localCover =
    source === "local" && isPrivateAudioFile(track.artwork)
      ? track.artwork
      : null;
  const artwork = httpsUrl(track.artwork) ?? localCover ?? "";
  const permalink =
    source === "audius" && typeof track.permalink === "string"
      ? httpsUrl(track.permalink)
      : null;
  return {
    id: `${source}:${providerId}`,
    providerId,
    source,
    title: text(
      track.title,
      source === "local" ? "Imported song" : "Untitled track",
    ),
    artist: text(
      track.artist,
      source === "local" ? "Your library" : "Audius artist",
    ),
    artwork,
    duration: nonnegative(track.duration, 24 * 3600),
    streamUrl:
      source === "audius"
        ? audiusStreamUrl(providerId)
        : (track.streamUrl as string),
    ...(permalink && new URL(permalink).hostname === "audius.co"
      ? { permalink }
      : {}),
    ...(typeof track.genre === "string"
      ? { genre: track.genre.slice(0, 80) }
      : {}),
    ...(source === "local" &&
    typeof track.importedAt === "number" &&
    Number.isFinite(track.importedAt)
      ? { importedAt: Math.max(0, track.importedAt) }
      : {}),
  };
}

export function sanitizeAudioSettings(
  value: unknown,
  now = Date.now(),
): AudioSettings {
  const settings = object(value) ?? {};
  const sleepAt =
    typeof settings.sleepAt === "number" &&
    Number.isFinite(settings.sleepAt) &&
    settings.sleepAt > now &&
    settings.sleepAt <= now + 24 * 3600_000
      ? settings.sleepAt
      : null;
  return {
    crossfadeSeconds: nonnegative(
      settings.crossfadeSeconds,
      12,
      defaultAudioSettings.crossfadeSeconds,
    ),
    fadeInSeconds: nonnegative(
      settings.fadeInSeconds,
      3,
      defaultAudioSettings.fadeInSeconds,
    ),
    fadeOutSeconds: nonnegative(
      settings.fadeOutSeconds,
      3,
      defaultAudioSettings.fadeOutSeconds,
    ),
    curve: settings.curve === "linear" ? "linear" : "equalPower",
    repeat: ["off", "all", "one"].includes(String(settings.repeat))
      ? (settings.repeat as AudioSettings["repeat"])
      : "off",
    sleepAt,
  };
}

function references(value: unknown, known: Set<string>, cap: number): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is string => typeof id === "string" && known.has(id),
          ),
        ),
      ].slice(0, cap)
    : [];
}

export function sanitizeLibrary(value: unknown, now = Date.now()): LibraryData {
  const library = object(value);
  if (!library) return defaultLibrary();
  const tracks: MusicTrack[] = [];
  const known = new Set<string>();
  if (Array.isArray(library.tracks))
    for (const candidate of library.tracks.slice(0, MAX_TRACKS)) {
      const track = sanitizeTrack(candidate);
      if (track && !known.has(track.id)) {
        known.add(track.id);
        tracks.push(track);
      }
    }
  const playlists: SavedPlaylist[] = [];
  const playlistIds = new Set<string>();
  if (Array.isArray(library.playlists))
    for (const candidate of library.playlists.slice(0, 100)) {
      const item = object(candidate);
      if (
        !item ||
        typeof item.id !== "string" ||
        !/^[A-Za-z0-9_.:-]{1,128}$/.test(item.id) ||
        playlistIds.has(item.id)
      )
        continue;
      playlistIds.add(item.id);
      playlists.push({
        id: item.id,
        name: text(item.name, "New playlist", 100),
        description: text(item.description, "", 500),
        trackIds: references(item.trackIds, known, 500),
        createdAt: nonnegative(item.createdAt, now, now),
      });
    }
  const lyrics: Record<string, string> = {};
  let lyricCharacters = 0;
  const lyricMap = object(library.lyrics);
  if (lyricMap)
    for (const [id, lyric] of Object.entries(lyricMap).slice(0, 100)) {
      if (
        !known.has(id) ||
        typeof lyric !== "string" ||
        lyric.length > 1_000_000 ||
        lyricCharacters + lyric.length > MAX_LYRICS_CHARACTERS
      )
        continue;
      try {
        if (parseLRC(lyric).length) {
          lyrics[id] = lyric;
          lyricCharacters += lyric.length;
        }
      } catch {
        /* Preserve only usable timed lyrics. */
      }
    }
  return {
    version: 2,
    tracks,
    favoriteIds: references(library.favoriteIds, known, MAX_TRACKS),
    recentIds: references(library.recentIds, known, 100),
    playlists,
    lyrics,
    audioSettings: sanitizeAudioSettings(library.audioSettings, now),
    youtubeKey:
      typeof library.youtubeKey === "string"
        ? library.youtubeKey.trim().slice(0, 512)
        : "",
  };
}

function parseSaved(value: string | null): unknown {
  if (!value || value.length > MAX_STORED_CHARACTERS) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function resolveStorage(
  storage?: LibraryStorage,
): Promise<LibraryStorage> {
  if (storage) return storage;
  return (await import("@react-native-async-storage/async-storage")).default;
}

/** Old settings are left intact, so returning to v1 never destroys the user's data. */
export async function loadLibrary(
  storage?: LibraryStorage,
): Promise<LibraryData> {
  const store = await resolveStorage(storage);
  const saved = await store.getItem(LIBRARY_STORAGE_KEY);
  const parsed = parseSaved(saved);
  if (object(parsed)?.version === 2) return sanitizeLibrary(parsed);
  const [favoritesText, lyricsText, key] = await Promise.all([
    store.getItem("dashy:favorites:v1"),
    store.getItem("dashy:lyrics:v1"),
    store.getItem("dashy:youtube-key:v1"),
  ]);
  const library = defaultLibrary();
  const rawFavorites = parseSaved(favoritesText);
  const rawLyrics = object(parseSaved(lyricsText)) ?? {};
  const ids = new Set<string>();
  const favoriteIds = new Set<string>();
  if (Array.isArray(rawFavorites))
    for (const value of rawFavorites.slice(0, MAX_TRACKS)) {
      const id = typeof value === "string" ? value : object(value)?.id;
      if (typeof id === "string") {
        ids.add(id);
        favoriteIds.add(id);
      }
    }
  for (const id of Object.keys(rawLyrics).slice(0, 100)) ids.add(id);
  for (const id of ids) {
    const track = youtubeTrackFromId(id);
    if (!track) continue;
    library.tracks.push(track);
    if (favoriteIds.has(id)) library.favoriteIds.push(track.id);
    const lyric = rawLyrics[id];
    if (typeof lyric === "string") library.lyrics[track.id] = lyric;
  }
  library.youtubeKey = key ?? "";
  return sanitizeLibrary(library);
}

export async function saveLibrary(
  library: LibraryData,
  storage?: LibraryStorage,
): Promise<void> {
  const store = await resolveStorage(storage);
  const json = JSON.stringify(sanitizeLibrary(library));
  if (json.length > MAX_STORED_CHARACTERS)
    throw new Error("Your library is too large to save on this device.");
  await store.setItem(LIBRARY_STORAGE_KEY, json);
}

/** Newer metadata replaces old entries; newest additions are retained at the library limit. */
export function mergeTracks(
  existing: readonly MusicTrack[],
  incoming: readonly MusicTrack[],
): MusicTrack[] {
  const seen = new Set<string>();
  return [...incoming, ...existing]
    .filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    })
    .slice(0, MAX_TRACKS);
}
