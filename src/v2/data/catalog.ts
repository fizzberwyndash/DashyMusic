import type { AudioItem, MusicTrack } from "../types";

const API = "https://api.audius.co/v1";
const APP_NAME = "DashyMusic";
const AUDIO_ID = /^[A-Za-z0-9_-]{1,64}$/;
const REQUEST_TIMEOUT = 16_000;

export function httpsUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    /[\u0000-\u001f]/.test(value)
  )
    return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !!url.hostname
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function audiusStreamUrl(id: string): string {
  if (!AUDIO_ID.test(id)) throw new Error("This music link is invalid.");
  return `${API}/tracks/${encodeURIComponent(id)}/stream?app_name=${APP_NAME}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function label(value: unknown, fallback: string, max = 300): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback;
}

/** Audius' direct/signed stream URLs expire. Keep its stable official stream endpoint instead. */
export function normalizeAudiusTrack(value: unknown): MusicTrack | null {
  const item = record(value);
  if (!item || typeof item.id !== "string" || !AUDIO_ID.test(item.id))
    return null;
  const access = record(item.access);
  if (
    item.is_streamable !== true ||
    item.is_stream_gated === true ||
    item.is_unlisted === true ||
    item.is_delete === true ||
    item.is_deleted === true ||
    access?.stream === false
  )
    return null;
  const user = record(item.user);
  const artwork = record(item.artwork);
  const cover =
    httpsUrl(artwork?.["1000x1000"]) ??
    httpsUrl(artwork?.["480x480"]) ??
    httpsUrl(artwork?.["150x150"]) ??
    "";
  const duration =
    typeof item.duration === "number" &&
    Number.isFinite(item.duration) &&
    item.duration > 0
      ? Math.min(item.duration, 24 * 3600)
      : 0;
  const permalink =
    typeof item.permalink === "string" &&
    item.permalink.startsWith("/") &&
    !item.permalink.startsWith("//")
      ? httpsUrl(`https://audius.co${item.permalink}`)
      : null;
  return {
    id: `audius:${item.id}`,
    providerId: item.id,
    source: "audius",
    title: label(item.title, "Untitled track"),
    artist: label(user?.name, "Audius artist"),
    artwork: cover,
    duration,
    streamUrl: audiusStreamUrl(item.id),
    ...(permalink ? { permalink } : {}),
    ...(typeof item.genre === "string"
      ? { genre: item.genre.slice(0, 80) }
      : {}),
  };
}

function cancelled(): Error {
  return Object.assign(new Error("Request canceled."), { name: "AbortError" });
}

async function request(
  path: string,
  parameters: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) throw cancelled();
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT);
  try {
    const query = new URLSearchParams({ app_name: APP_NAME, ...parameters });
    const response = await fetch(`${API}${path}?${query}`, {
      signal: controller.signal,
    });
    if (response.status === 429)
      throw new Error(
        "The music catalog is busy. Wait a moment and try again.",
      );
    if (response.status === 403 || response.status === 401)
      throw new Error(
        "Could not access the music catalog on this connection. Try another network.",
      );
    if (!response.ok)
      throw new Error(
        "The music catalog is temporarily unavailable. Please try again.",
      );
    const body: unknown = await response.json().catch(() => {
      throw new Error(
        "The music catalog returned an unreadable response. Please try again.",
      );
    });
    const envelope = record(body);
    if (!envelope || !("data" in envelope))
      throw new Error(
        "The music catalog returned an unexpected response. Please try again.",
      );
    return envelope.data;
  } catch (error) {
    if (signal?.aborted) throw cancelled();
    if (timedOut)
      throw new Error(
        "The music catalog took too long to respond. Check your connection and try again.",
      );
    if (error instanceof Error && error.message.startsWith("The music catalog"))
      throw error;
    if (error instanceof Error && error.message.startsWith("Could not access"))
      throw error;
    throw new Error(
      "Music search could not connect. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function tracksFrom(value: unknown): MusicTrack[] {
  if (!Array.isArray(value))
    throw new Error(
      "The music catalog returned an unexpected response. Please try again.",
    );
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const track = normalizeAudiusTrack(item);
    if (!track || seen.has(track.id)) return [];
    seen.add(track.id);
    return [track];
  });
}

export async function searchAudius(
  query: string,
  signal?: AbortSignal,
): Promise<MusicTrack[]> {
  const term = query.trim().slice(0, 300);
  if (!term) return [];
  return tracksFrom(
    await request("/tracks/search", { query: term, limit: "30" }, signal),
  );
}

export async function getTrending(
  genre?: string,
  signal?: AbortSignal,
): Promise<MusicTrack[]> {
  const chosen = genre?.trim().slice(0, 80);
  return tracksFrom(
    await request(
      "/tracks/trending",
      {
        limit: "30",
        time: "week",
        ...(chosen && chosen !== "All" ? { genre: chosen } : {}),
      },
      signal,
    ),
  );
}

export async function getAudiusTrack(
  id: string,
  signal?: AbortSignal,
): Promise<MusicTrack | null> {
  const providerId = id.startsWith("audius:") ? id.slice(7) : id;
  if (!AUDIO_ID.test(providerId)) return null;
  return normalizeAudiusTrack(
    await request(`/tracks/${encodeURIComponent(providerId)}`, {}, signal),
  );
}

/** YouTube metadata cannot become an audio stream. */
export function toAudioItem(track: MusicTrack): AudioItem {
  if (track.source === "youtube" || !track.streamUrl)
    throw new Error("Open YouTube videos in the visible video player.");
  let url: string;
  if (track.source === "audius") url = audiusStreamUrl(track.providerId);
  else {
    const candidate = new URL(track.streamUrl);
    if (
      !["file:", "blob:"].includes(candidate.protocol) ||
      (candidate.protocol === "file:" && !!candidate.hostname)
    )
      throw new Error(
        "This imported audio file is unavailable. Import it again.",
      );
    url = track.streamUrl;
  }
  return {
    id: track.id,
    url,
    title: track.title,
    artist: track.artist,
    artwork: track.artwork,
    duration: track.duration,
  };
}
