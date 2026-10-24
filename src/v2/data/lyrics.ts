import { parseLRC } from "../../lib/lyrics";
import type { MusicTrack } from "../types";

export type SyncedLyricsResult = { syncedLyrics: string; sourceUrl: string };

const API = "https://lrclib.net/api/get";
const CLIENT =
  "DashyMusic/0.2.0 (https://github.com/fizzberwyndash/DashyMusic)";
const TIMEOUT_MS = 12_000;
const CACHE_LIMIT = 32;
const CACHE_CHARACTERS = 2_000_000;
const cache = new Map<
  string,
  { expiresAt: number; result: SyncedLyricsResult | null }
>();
let blockedUntil = 0;
let activeRequests = 0;

function aborted(): Error {
  return Object.assign(new Error("Lyrics lookup canceled."), {
    name: "AbortError",
  });
}

function normalize(value: unknown): string {
  return typeof value === "string"
    ? value
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(/[‘’]/g, "'")
        .replace(/[–—]/g, "-")
        .replace(/\s+/g, " ")
    : "";
}

function readRecord(
  value: unknown,
  track: MusicTrack,
): SyncedLyricsResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(record.id) ||
    Number(record.id) <= 0 ||
    record.instrumental === true
  )
    return null;
  if (
    normalize(record.trackName ?? record.name) !== normalize(track.title) ||
    normalize(record.artistName) !== normalize(track.artist)
  )
    return null;
  if (
    typeof record.duration !== "number" ||
    !Number.isFinite(record.duration) ||
    record.duration <= 0 ||
    Math.abs(record.duration - track.duration) > 2
  )
    return null;
  if (
    typeof record.syncedLyrics !== "string" ||
    record.syncedLyrics.length > 1_000_000
  )
    return null;
  try {
    const lines = parseLRC(record.syncedLyrics);
    if (!lines.length || lines.at(-1)!.time > track.duration + 5) return null;
  } catch {
    return null;
  }
  return {
    syncedLyrics: record.syncedLyrics,
    sourceUrl: `https://lrclib.net/tracks/${record.id}`,
  };
}

function remember(key: string, result: SyncedLyricsResult | null) {
  cache.delete(key);
  cache.set(key, {
    expiresAt: Date.now() + (result ? 3600_000 : 5 * 60_000),
    result,
  });
  let characters = 0;
  for (const entry of cache.values())
    characters += entry.result?.syncedLyrics.length ?? 0;
  while (cache.size > CACHE_LIMIT || characters > CACHE_CHARACTERS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    characters -= cache.get(oldest)?.result?.syncedLyrics.length ?? 0;
    cache.delete(oldest);
  }
}

function applyBackoff(header: string | null) {
  const seconds =
    header !== null && /^\d+(?:\.\d+)?$/.test(header.trim())
      ? Number(header)
      : null;
  const date = header ? Date.parse(header) : NaN;
  const delay =
    seconds !== null
      ? seconds * 1000
      : Number.isFinite(date)
        ? date - Date.now()
        : 30_000;
  blockedUntil = Date.now() + Math.max(1000, Math.min(3600_000, delay));
}

/** Clears only this process's transient lookup cache; persisted user-imported lyrics are untouched. */
export function clearLyricsLookupCache() {
  cache.clear();
  blockedUntil = 0;
}

/**
 * Looks up an exact song signature on LRCLIB. Its API permission is separate from
 * any rights required to display or distribute lyrics. No fuzzy or plain-text
 * lyrics are presented as synchronized lyrics.
 */
export async function fetchSyncedLyrics(
  track: MusicTrack,
  signal?: AbortSignal,
): Promise<SyncedLyricsResult | null> {
  if (signal?.aborted) throw aborted();
  const artist = track.artist.trim();
  const title = track.title.trim();
  // Duration is deliberately required here, although the provider makes it optional:
  // versions with the same title and artist can have different lyric timing.
  if (
    !artist ||
    !title ||
    artist.length > 300 ||
    title.length > 300 ||
    !Number.isFinite(track.duration) ||
    track.duration < 1 ||
    track.duration > 3600
  )
    return null;
  const key = JSON.stringify([
    normalize(artist),
    normalize(title),
    track.duration,
  ]);
  const saved = cache.get(key);
  if (saved && saved.expiresAt > Date.now())
    return saved.result ? { ...saved.result } : null;
  cache.delete(key);
  if (blockedUntil > Date.now())
    throw new Error(
      "Lyrics lookup is taking a short break. Please try again later.",
    );
  if (activeRequests >= 2)
    throw new Error("Lyrics lookup is busy. Please try again in a moment.");

  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  activeRequests += 1;
  try {
    const parameters = new URLSearchParams({
      artist_name: artist,
      track_name: title,
      duration: String(Math.round(track.duration)),
    });
    const response = await fetch(`${API}?${parameters}`, {
      signal: controller.signal,
      headers: { "Lrclib-Client": CLIENT },
    });
    if (response.status === 404) {
      remember(key, null);
      return null;
    }
    if (response.status === 429 || response.status === 503) {
      applyBackoff(response.headers.get("Retry-After"));
      throw new Error(
        "Lyrics lookup is taking a short break. Please try again later.",
      );
    }
    if (!response.ok)
      throw new Error(
        "Lyrics are temporarily unavailable. Please try again later.",
      );
    if (
      !response.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("application/json")
    )
      throw new Error(
        "The lyrics provider returned an unreadable response. Please try again later.",
      );
    const body: unknown = await response.json().catch(() => {
      throw new Error(
        "The lyrics provider returned an unreadable response. Please try again later.",
      );
    });
    const result = readRecord(body, track);
    remember(key, result);
    return result ? { ...result } : null;
  } catch (failure) {
    if (signal?.aborted) throw aborted();
    if (timedOut)
      throw new Error(
        "Lyrics lookup took too long. Check your connection and try again.",
      );
    if (
      failure instanceof Error &&
      /^(Lyrics|The lyrics provider)/.test(failure.message)
    )
      throw failure;
    throw new Error(
      "Could not reach the lyrics provider. Check your connection and try again.",
    );
  } finally {
    activeRequests -= 1;
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
