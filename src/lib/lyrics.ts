export type LyricLine = { time: number; text: string };

const MAX_LRC_CHARACTERS = 1_000_000;
const MAX_LRC_LINES = 12_000;

/** Parse user-supplied LRC. No lyrics are fetched or extracted from YouTube. */
export function parseLRC(input: string): LyricLine[] {
  if (input.length > MAX_LRC_CHARACTERS) throw new Error('Choose a lyric file smaller than 1 MB.');
  const lines = input.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.length > MAX_LRC_LINES) throw new Error('This lyric file has too many lines.');

  // LRC offsets are milliseconds and affect every timestamp, even if metadata is at the end.
  let offset = 0;
  for (const line of lines) {
    const match = /^\s*\[offset:([+-]?\d+)\]\s*$/i.exec(line);
    if (match) {
      const milliseconds = Number(match[1]);
      if (Number.isSafeInteger(milliseconds)) offset = milliseconds / 1000;
    }
  }

  const result: LyricLine[] = [];
  for (const line of lines) {
    // A line must begin with a timestamp; metadata and untimed prose are ignored.
    if (!/^\s*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(line)) continue;
    const timestamp = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    const matches = [...line.matchAll(timestamp)];
    const text = line.replace(timestamp, '').trim();
    if (!text) continue;
    for (const match of matches) {
      const seconds = Number(match[2]);
      if (seconds >= 60) continue;
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      const time = Math.max(0, Number(match[1]) * 60 + seconds + fraction + offset);
      result.push({ time, text });
    }
  }
  // JavaScript's stable sort retains original line order for identical timestamps.
  return result.sort((a, b) => a.time - b.time);
}

/** Index of the latest line at or before the player time; -1 before the first line. */
export function activeLyricIndex(lines: readonly LyricLine[], seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return -1;
  let start = 0;
  let end = lines.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (lines[middle].time <= seconds) start = middle + 1;
    else end = middle;
  }
  return start - 1;
}

/** Original UI demonstration text, never represented as a selected song's lyrics. */
export const demoLyrics: LyricLine[] = [
  { time: 0, text: 'A little light across the room' },
  { time: 5, text: 'A rhythm only we can hear' },
  { time: 10, text: 'Let every color find its tune' },
  { time: 15, text: 'And keep the moment close and clear' },
];
