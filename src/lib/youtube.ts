import type { Track } from './music';

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const ACCENTS = ['#bda4ef', '#df9bb0', '#8fcfc3', '#e4c391', '#91b9e6'];

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
  };
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, code: string) => {
      const value = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Official metadata search only. Playback uses the separate, visible YouTube IFrame player. */
export async function searchVideos(query: string, apiKey: string, signal?: AbortSignal): Promise<Track[]> {
  if (!apiKey.trim()) throw new Error('Add a YouTube Data API key in Settings to search YouTube.');
  const term = query.trim();
  if (!term) return [];

  const parameters = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    maxResults: '12',
    q: term.slice(0, 300),
    key: apiKey.trim(),
  });

  let response: Response;
  try {
    response = await fetch(`${SEARCH_ENDPOINT}?${parameters.toString()}`, { signal });
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') throw error;
    throw new Error('YouTube search could not connect. Check your connection and try again.');
  }

  let body: {
    items?: YouTubeSearchItem[];
    error?: { errors?: { reason?: string }[] };
  };
  try {
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid JSON shape');
    body = parsed;
  } catch {
    throw new Error('YouTube returned an unexpected response. Please try again later.');
  }

  if (!response.ok || body.error) {
    const reason = body.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || response.status === 429) {
      throw new Error('The YouTube search quota is used up. Try again after it resets, or open a video link.');
    }
    if (['keyInvalid', 'accessNotConfigured', 'ipRefererBlocked', 'forbidden'].includes(reason ?? '') || [400, 401, 403].includes(response.status)) {
      throw new Error('YouTube search is not authorized. Check the API key, API activation, and key restrictions in Google Cloud.');
    }
    throw new Error('YouTube search is temporarily unavailable. Please try again later.');
  }

  if (!Array.isArray(body.items)) return [];
  return body.items.flatMap((item, index): Track[] => {
    if (!item || typeof item !== 'object') return [];
    const id = item.id?.videoId;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id)) return [];
    const thumbnail = item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url;
    // Avoid propagating arbitrary API response URLs to image components.
    const safeThumbnail = typeof thumbnail === 'string' && thumbnail.startsWith('https://i.ytimg.com/') ? thumbnail : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    return [{
      id,
      title: decodeEntities(typeof item.snippet?.title === 'string' ? item.snippet.title : 'YouTube video'),
      artist: decodeEntities(typeof item.snippet?.channelTitle === 'string' ? item.snippet.channelTitle : 'YouTube'),
      thumbnail: safeThumbnail,
      accent: ACCENTS[index % ACCENTS.length],
    }];
  });
}
