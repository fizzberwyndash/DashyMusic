/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  audiusStreamUrl,
  defaultLibrary,
  externalProviderSearchUrl,
  getAudiusTrack,
  getTrending,
  isPrivateAudioFile,
  LIBRARY_STORAGE_KEY,
  loadLibrary,
  mergeTracks,
  normalizeAudiusTrack,
  sanitizeAudioSettings,
  sanitizeLibrary,
  sanitizeTrack,
  saveLibrary,
  searchAudius,
  searchYouTube,
  toAudioItem,
  youtubeTrackFromId,
} from "../src/v2/data";
import type { MusicTrack } from "../src/v2/types";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "mzXmz1",
  title: "On The Floor",
  user: { name: "Ciara Graves" },
  duration: 180,
  artwork: { "1000x1000": "https://validator.example/content/cover.jpg" },
  genre: "Dubstep",
  is_streamable: true,
  is_stream_gated: false,
  is_delete: false,
  is_unlisted: false,
  access: { stream: true },
  permalink: "/ciaragraves/on-the-floor",
  stream: { url: "https://validator.example/private-signed-url?token=expires" },
  ...overrides,
});
const track = () => normalizeAudiusTrack(row())!;

function memory(values: Record<string, string> = {}) {
  const map = new Map(Object.entries(values));
  return {
    map,
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

test("Audius metadata yields stable canonical streams and preserves real attribution", () => {
  const result = track();
  assert.equal(result.id, "audius:mzXmz1");
  assert.equal(result.title, "On The Floor");
  assert.equal(result.artist, "Ciara Graves");
  assert.equal(result.artwork, "https://validator.example/content/cover.jpg");
  assert.equal(result.permalink, "https://audius.co/ciaragraves/on-the-floor");
  assert.equal(
    result.streamUrl,
    "https://api.audius.co/v1/tracks/mzXmz1/stream?app_name=DashyMusic",
  );
  assert.ok(!JSON.stringify(result).includes("private-signed-url"));
  assert.equal(toAudioItem(result).url, result.streamUrl);
  assert.throws(() => audiusStreamUrl("../token"), /invalid/);
});

test("Audius filters gated, unavailable, unlisted and malformed tracks; unsafe artwork is discarded", () => {
  for (const patch of [
    { is_streamable: false },
    { is_stream_gated: true },
    { is_unlisted: true },
    { is_delete: true },
    { is_deleted: true },
    { access: { stream: false } },
    { id: "../invalid" },
    { id: null },
  ])
    assert.equal(normalizeAudiusTrack(row(patch)), null);
  assert.equal(normalizeAudiusTrack(null), null);
  const result = normalizeAudiusTrack(
    row({
      duration: Infinity,
      title: null,
      user: null,
      artwork: {
        "1000x1000": "javascript:alert(1)",
        "480x480": "https://user:secret@host.example/cover.jpg",
        "150x150": "https://safe.example/small.jpg",
      },
      permalink: "//outside.example/x",
    }),
  )!;
  assert.equal(result.duration, 0);
  assert.equal(result.title, "Untitled track");
  assert.equal(result.artwork, "https://safe.example/small.jpg");
  assert.equal(result.permalink, undefined);
});

test("Audius search and trending send documented metadata requests, filter records and deduplicate", async () => {
  const original = globalThis.fetch;
  const urls: URL[] = [];
  globalThis.fetch = async (input) => {
    urls.push(new URL(String(input)));
    return new Response(
      JSON.stringify({
        data: [row(), row(), row({ id: "gated", is_stream_gated: true })],
      }),
    );
  };
  try {
    assert.equal((await searchAudius("  city lights  ")).length, 1);
    assert.equal(urls[0].pathname, "/v1/tracks/search");
    assert.equal(urls[0].searchParams.get("query"), "city lights");
    assert.equal(urls[0].searchParams.get("app_name"), "DashyMusic");
    assert.equal(urls[0].searchParams.has("api_key"), false);
    await getTrending("Electronic");
    assert.equal(urls[1].pathname, "/v1/tracks/trending");
    assert.equal(urls[1].searchParams.get("genre"), "Electronic");
    assert.equal(urls[1].searchParams.get("time"), "week");
    assert.deepEqual(await searchAudius("  "), []);
    assert.equal(urls.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("single-track refresh uses provider ID and rejects invalid IDs without a request", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ data: row() }));
  };
  try {
    assert.equal((await getAudiusTrack("audius:mzXmz1"))?.id, "audius:mzXmz1");
    assert.match(urls[0], /\/tracks\/mzXmz1\?/);
    assert.equal(await getAudiusTrack("../../secrets"), null);
    assert.equal(urls.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("catalog request failures are actionable, avoid raw service text, and preserve cancellation", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response("private server details", { status: 429 });
    await assert.rejects(searchAudius("city"), /catalog is busy/);
    globalThis.fetch = async () =>
      new Response("private server details", { status: 403 });
    await assert.rejects(searchAudius("city"), /Try another network/);
    globalThis.fetch = async () => new Response(JSON.stringify({ data: null }));
    await assert.rejects(searchAudius("city"), /unexpected response/);
    globalThis.fetch = async () => new Response("not json");
    await assert.rejects(searchAudius("city"), /unreadable response/);
    globalThis.fetch = async () => {
      throw new Error("untrusted private request information");
    };
    await assert.rejects(searchAudius("city"), /could not connect/);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      searchAudius("city", controller.signal),
      (error) => (error as Error).name === "AbortError",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("YouTube links use official visible playback only and external services search their own websites", async () => {
  const result = await searchYouTube("https://youtu.be/JGwWNGJdvx8", "");
  assert.equal(result[0].source, "youtube");
  assert.equal(result[0].id, "youtube:JGwWNGJdvx8");
  assert.equal(result[0].streamUrl, undefined);
  assert.throws(() => toAudioItem(result[0]), /visible video player/);
  assert.equal(
    youtubeTrackFromId("https://youtube.com.evil.example/watch?v=JGwWNGJdvx8"),
    null,
  );
  assert.equal(
    externalProviderSearchUrl("spotify", "  a & b  "),
    "https://open.spotify.com/search/a%20%26%20b",
  );
  assert.equal(
    externalProviderSearchUrl("soundcloud", "a & b"),
    "https://soundcloud.com/search/sounds?q=a%20%26%20b",
  );
});

test("library sanitizer rebuilds streams, removes unsafe files/URLs and repairs references", () => {
  const music = track();
  const local: MusicTrack = {
    id: "local:owned",
    providerId: "owned",
    source: "local",
    title: "My song",
    artist: "Me",
    artwork: "",
    duration: 120,
    streamUrl:
      "file:///private/var/mobile/Containers/Data/Application/ABC/Documents/DashyMusic/song.mp3",
  };
  const result = sanitizeLibrary({
    tracks: [
      { ...music, streamUrl: "https://expired.example/signed?token=abc" },
      local,
      {
        ...local,
        id: "local:bad",
        providerId: "bad",
        streamUrl: "file:///etc/passwd",
      },
      {
        ...local,
        id: "local:blob",
        providerId: "blob",
        streamUrl: "blob:https://app.example/session",
      },
      {
        ...music,
        id: "audius:second",
        providerId: "second",
        artwork: "http://not-https.example/x",
      },
    ],
    favoriteIds: [music.id, music.id, "unknown", local.id],
    recentIds: ["unknown", local.id],
    playlists: [
      {
        id: "mix",
        name: "My mix",
        trackIds: ["unknown", music.id, music.id],
        createdAt: 10,
      },
    ],
    lyrics: {
      [music.id]: "[00:00.00]Original words",
      unknown: "[00:00.00]No track",
      [local.id]: "Not timed",
    },
  });
  assert.equal(result.tracks.length, 3);
  assert.equal(result.tracks[0].streamUrl, audiusStreamUrl("mzXmz1"));
  assert.equal(result.tracks[2].artwork, "");
  assert.deepEqual(result.favoriteIds, [music.id, local.id]);
  assert.deepEqual(result.recentIds, [local.id]);
  assert.deepEqual(result.playlists[0].trackIds, [music.id]);
  assert.deepEqual(Object.keys(result.lyrics), [music.id]);
  assert.ok(isPrivateAudioFile(local.streamUrl));
  assert.equal(
    isPrivateAudioFile("file://other-machine/Documents/song.mp3"),
    false,
  );
  assert.equal(
    isPrivateAudioFile("file:///Documents/%2f..%2f../secret"),
    false,
  );
  assert.equal(
    sanitizeTrack({ ...local, streamUrl: "https://remote.example/song.mp3" }),
    null,
  );
  assert.equal(
    sanitizeTrack({
      ...youtubeTrackFromId("JGwWNGJdvx8"),
      id: "local:spoofed",
    }),
    null,
  );
});

test("audio settings clamp unsupported values and never reactivate an expired sleep timer", () => {
  const now = 1_800_000_000_000;
  assert.deepEqual(
    sanitizeAudioSettings(
      {
        crossfadeSeconds: 999,
        fadeInSeconds: -4,
        fadeOutSeconds: NaN,
        curve: "fake",
        repeat: "fake",
        sleepAt: now - 1,
      },
      now,
    ),
    {
      crossfadeSeconds: 12,
      fadeInSeconds: 0,
      fadeOutSeconds: 1.2,
      curve: "equalPower",
      repeat: "off",
      sleepAt: null,
    },
  );
  assert.equal(
    sanitizeAudioSettings({ sleepAt: now + 30_000 }, now).sleepAt,
    now + 30_000,
  );
  assert.equal(
    sanitizeAudioSettings({ sleepAt: now + 25 * 3600_000 }, now).sleepAt,
    null,
  );
  const one = defaultLibrary();
  const two = defaultLibrary();
  one.audioSettings.crossfadeSeconds = 1;
  assert.equal(two.audioSettings.crossfadeSeconds, 6);
});

test("v1 favorites, key and timed lyrics migrate without modifying old storage", async () => {
  const store = memory({
    "dashy:favorites:v1": JSON.stringify([
      "JGwWNGJdvx8",
      { id: "4NRXx6U8ABQ" },
      "bad",
    ]),
    "dashy:lyrics:v1": JSON.stringify({
      JGwWNGJdvx8: "[00:00.00]Original words",
      DyDfgMOUjCI: "[00:02.00]More original words",
    }),
    "dashy:youtube-key:v1": "test-public-key",
  });
  const migrated = await loadLibrary(store);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.tracks.length, 3);
  assert.deepEqual(migrated.favoriteIds, [
    "youtube:JGwWNGJdvx8",
    "youtube:4NRXx6U8ABQ",
  ]);
  assert.equal(migrated.youtubeKey, "test-public-key");
  assert.equal(
    migrated.lyrics["youtube:DyDfgMOUjCI"],
    "[00:02.00]More original words",
  );
  assert.equal(store.map.get("dashy:youtube-key:v1"), "test-public-key");
  assert.equal(store.map.has(LIBRARY_STORAGE_KEY), false);
});

test("v2 save/load round trips library safely and merge prefers newly fetched metadata", async () => {
  const store = memory();
  const library = defaultLibrary();
  library.tracks = [track()];
  library.favoriteIds = [track().id];
  library.playlists = [
    {
      id: "mix:1",
      name: "A real mix",
      description: "",
      trackIds: [track().id],
      createdAt: Date.now(),
    },
  ];
  await saveLibrary(library, store);
  const loaded = await loadLibrary(store);
  assert.deepEqual(loaded.favoriteIds, library.favoriteIds);
  assert.equal(loaded.playlists[0].name, "A real mix");
  assert.equal(loaded.tracks[0].streamUrl, audiusStreamUrl("mzXmz1"));
  const newer = { ...track(), title: "Updated title" };
  assert.deepEqual(mergeTracks([track()], [newer]), [newer]);
  store.map.set(LIBRARY_STORAGE_KEY, "corrupt json");
  assert.deepEqual(await loadLibrary(store), defaultLibrary());
});
