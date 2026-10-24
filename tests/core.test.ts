/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, parseYouTubeUrl, seedTracks, trackFromVideoId } from '../src/lib/music';
import { activeLyricIndex, parseLRC } from '../src/lib/lyrics';
import { searchVideos } from '../src/lib/youtube';

const id = '4NRXx6U8ABQ';

test('video parser accepts supported YouTube link formats and raw IDs', () => {
  for (const link of [
    id,
    ` https://www.youtube.com/watch?v=${id}&list=example `,
    `https://youtu.be/${id}?t=30`,
    `youtube.com/shorts/${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://youtube.com/live/${id}`,
  ]) assert.equal(parseYouTubeUrl(link), id, link);
});

test('video parser rejects lookalike hosts, credentials, non-video links, and malformed IDs', () => {
  for (const link of [
    '', 'not a video', 'https://youtube.com.evil.test/watch?v=' + id,
    `https://youtube.com@evil.test/watch?v=${id}`, `https://user:password@youtube.com/watch?v=${id}`,
    `ftp://youtube.com/watch?v=${id}`, `https://youtube.com:8123/watch?v=${id}`,
    `https://youtu.be/${id}/extra`, 'https://youtube.com/playlist?list=123',
    'https://youtube.com/watch?v=tooShort', `https://youtube-nocookie.com/watch?v=${id}`,
  ]) assert.equal(parseYouTubeUrl(link), null, link);
});

test('track conversion reuses curated metadata and validates IDs', () => {
  assert.equal(trackFromVideoId(id), seedTracks[0]);
  assert.equal(trackFromVideoId('abcdefghijk').title, 'YouTube video');
  assert.throws(() => trackFromVideoId('invalid'));
  assert.equal(new Set(seedTracks.map((track) => track.id)).size, 8);
});

test('time formatter handles zero, invalid values, fractions, and hours', () => {
  assert.equal(formatTime(-1), '0:00');
  assert.equal(formatTime(NaN), '0:00');
  assert.equal(formatTime(Infinity), '0:00');
  assert.equal(formatTime(65.9), '1:05');
  assert.equal(formatTime(3723), '1:02:03');
});

test('LRC parser supports metadata, multi-timestamps, fractions, CRLF, and sorting', () => {
  const result = parseLRC('\uFEFF[ti:Original sample]\r\n[ar:Dashy]\r\n[00:12.25]Later\r\n[00:02.5][00:07.050]Repeat\r\n[00:03:250]Colon\r\nuntimed');
  assert.deepEqual(result, [
    { time: 2.5, text: 'Repeat' },
    { time: 3.25, text: 'Colon' },
    { time: 7.05, text: 'Repeat' },
    { time: 12.25, text: 'Later' },
  ]);
});

test('LRC global offsets apply even after lyrics and negative timestamps clamp at zero', () => {
  assert.deepEqual(parseLRC('[00:00.50]Early\n[00:02]Later\n[offset:-1000]'), [
    { time: 0, text: 'Early' }, { time: 1, text: 'Later' },
  ]);
  assert.deepEqual(parseLRC('[offset:+250]\n[00:01]Line'), [{ time: 1.25, text: 'Line' }]);
});

test('LRC rejects invalid seconds, empty text, oversized input, and preserves timestamp ties', () => {
  assert.deepEqual(parseLRC('[00:60]Invalid\n[00:02]\n[00:01]First\n[00:01]Second'), [
    { time: 1, text: 'First' }, { time: 1, text: 'Second' },
  ]);
  assert.throws(() => parseLRC('a'.repeat(1_000_001)), /smaller than 1 MB/);
  assert.throws(() => parseLRC('\n'.repeat(12_001)), /too many lines/);
});

test('active lyric index follows playback boundaries and seeks, choosing latest ties', () => {
  const lyrics = [{ time: 2, text: 'a' }, { time: 4, text: 'b' }, { time: 4, text: 'c' }];
  assert.equal(activeLyricIndex(lyrics, 1.99), -1);
  assert.equal(activeLyricIndex(lyrics, 2), 0);
  assert.equal(activeLyricIndex(lyrics, 4), 2);
  assert.equal(activeLyricIndex(lyrics, 100), 2);
  assert.equal(activeLyricIndex(lyrics, -1), -1);
  assert.equal(activeLyricIndex(lyrics, NaN), -1);
  assert.equal(activeLyricIndex([], 10), -1);
});

test('search requires an API key but avoids requests for an empty query', async () => {
  await assert.rejects(searchVideos('music', ''), /API key/);
  assert.deepEqual(await searchVideos(' ', 'test-key'), []);
});

test('search filters video IDs, decodes titles, and sends only an embeddable music request', async () => {
  const originalFetch = globalThis.fetch;
  let requested = '';
  globalThis.fetch = (async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({ items: [
      { id: { videoId: id }, snippet: { title: 'Song &amp; &#39;Artist&#39;', channelTitle: 'A &quot;B&quot;' } },
      { id: { videoId: 'invalid' } },
    ] }), { status: 200 });
  }) as typeof fetch;
  try {
    const tracks = await searchVideos('test song', 'test-key');
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].title, "Song & 'Artist'");
    assert.equal(tracks[0].artist, 'A "B"');
    const params = new URL(requested).searchParams;
    assert.equal(params.get('type'), 'video');
    assert.equal(params.get('videoCategoryId'), '10');
    assert.equal(params.get('videoEmbeddable'), 'true');
    assert.equal(params.get('videoSyndicated'), 'true');
    assert.equal(params.get('maxResults'), '12');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('search reports quota and authorization errors without reflecting private response text', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'secret-key', errors: [{ reason: 'quotaExceeded' }] } }), { status: 403 })) as typeof fetch;
    await assert.rejects(searchVideos('song', 'secret-key'), (error: Error) => {
      assert.match(error.message, /quota/);
      assert.ok(!error.message.includes('secret-key'));
      return true;
    });
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'keyInvalid' }] } }), { status: 400 })) as typeof fetch;
    await assert.rejects(searchVideos('song', 'test-key'), /not authorized/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('search safely handles malformed service data and non-Error connection failures', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response('null', { status: 200 })) as typeof fetch;
    await assert.rejects(searchVideos('song', 'test-key'), /unexpected response/);
    globalThis.fetch = (async () => new Response(JSON.stringify({ items: [null, { id: { videoId: id }, snippet: { title: 42, thumbnails: { high: { url: 42 } } } }] }), { status: 200 })) as typeof fetch;
    const tracks = await searchVideos('song', 'test-key');
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].title, 'YouTube video');
    assert.equal(tracks[0].thumbnail, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    globalThis.fetch = (async () => { throw null; }) as typeof fetch;
    await assert.rejects(searchVideos('song', 'test-key'), /could not connect/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
