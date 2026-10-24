import { parseYouTubeUrl, seedTracks, trackFromVideoId } from "../../lib/music";
import { searchVideos } from "../../lib/youtube";
import type { Track } from "../../lib/music";
import type { MusicTrack } from "../types";
import { searchAudius } from "./catalog";

export function fromYouTubeTrack(track: Track): MusicTrack {
  return {
    id: `youtube:${track.id}`,
    providerId: track.id,
    source: "youtube",
    title: track.title,
    artist: track.artist,
    artwork: track.thumbnail,
    duration: 0,
    permalink: `https://www.youtube.com/watch?v=${track.id}`,
  };
}

export function youtubeTrackFromId(idOrUrl: string): MusicTrack | null {
  const id = parseYouTubeUrl(idOrUrl);
  return id ? fromYouTubeTrack(trackFromVideoId(id)) : null;
}

export const youtubeShortcuts = seedTracks.map(fromYouTubeTrack);

export async function searchYouTube(
  query: string,
  key: string,
  signal?: AbortSignal,
): Promise<MusicTrack[]> {
  const linked = youtubeTrackFromId(query);
  if (linked) return [linked];
  return (await searchVideos(query, key, signal)).map(fromYouTubeTrack);
}

export function searchProvider(
  provider: "audius" | "youtube",
  query: string,
  key = "",
  signal?: AbortSignal,
): Promise<MusicTrack[]> {
  return provider === "audius"
    ? searchAudius(query, signal)
    : searchYouTube(query, key, signal);
}

/** These links search the actual service; they are not in-app audio integrations. */
export function externalProviderSearchUrl(
  provider: "spotify" | "soundcloud",
  query: string,
): string {
  const term = query.trim().slice(0, 300);
  return provider === "spotify"
    ? `https://open.spotify.com/search/${encodeURIComponent(term)}`
    : `https://soundcloud.com/search/sounds?q=${encodeURIComponent(term)}`;
}
