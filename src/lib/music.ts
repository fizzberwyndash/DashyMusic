export type Track = {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  accent: string;
  durationLabel?: string;
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const musicVideo = (id: string, title: string, artist: string, accent: string): Track => ({
  id,
  title,
  artist,
  accent,
  thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
});

/** Discovery shortcuts to official YouTube videos; these are not an owned audio catalog. */
export const seedTracks: Track[] = [
  musicVideo('4NRXx6U8ABQ', 'Blinding Lights', 'The Weeknd', '#df647d'),
  musicVideo('DyDfgMOUjCI', 'bad guy', 'Billie Eilish', '#c8d888'),
  musicVideo('hT_nvWreIhg', 'Counting Stars', 'OneRepublic', '#7fc8bf'),
  musicVideo('JGwWNGJdvx8', 'Shape of You', 'Ed Sheeran', '#e6a579'),
  musicVideo('OPf0YbXqDm0', 'Uptown Funk', 'Mark Ronson ft. Bruno Mars', '#be9bd8'),
  musicVideo('fRh_vgS2dFE', 'Sorry', 'Justin Bieber', '#86b8db'),
  musicVideo('kJQP7kiw5Fk', 'Despacito', 'Luis Fonsi ft. Daddy Yankee', '#debd80'),
  musicVideo('dQw4w9WgXcQ', 'Never Gonna Give You Up', 'Rick Astley', '#dcb1c4'),
];

/** Parse video links only. Exact host checks reject look-alike and credential-bearing URLs. */
export function parseYouTubeUrl(value: string): string | null {
  const input = value.trim();
  if (VIDEO_ID.test(input)) return input;
  if (!input || input.length > 2048) return null;

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
      return null;
    }
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean);
    let candidate: string | null = null;

    if (host === 'youtu.be' || host === 'www.youtu.be') {
      if (segments.length === 1) candidate = segments[0];
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') candidate = url.searchParams.get('v');
      else if (segments.length === 2 && ['embed', 'shorts', 'live'].includes(segments[0])) {
        candidate = segments[1];
      }
    } else if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      if (segments.length === 2 && segments[0] === 'embed') candidate = segments[1];
    }

    return candidate && VIDEO_ID.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function trackFromVideoId(id: string): Track {
  if (!VIDEO_ID.test(id)) throw new Error('Enter a valid YouTube video link or video ID.');
  const known = seedTracks.find((track) => track.id === id);
  return known ?? musicVideo(id, 'YouTube video', 'Added from a link', '#bda4ef');
}

export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(total / 60);
  const remaining = String(total % 60).padStart(2, '0');
  if (minutes < 60) return `${minutes}:${remaining}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${remaining}`;
}
