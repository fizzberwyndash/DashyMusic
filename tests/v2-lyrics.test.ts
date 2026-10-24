/// <reference types="node" />
import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import {
  clearLyricsLookupCache,
  fetchSyncedLyrics,
} from "../src/v2/data/lyrics";
import type { MusicTrack } from "../src/v2/types";

// Original demonstration text only; no lyrics fetched from the service are stored here.
const original =
  "[00:00.00]A little light across the room\n[00:12.00]A rhythm only we can hear";
const track: MusicTrack = {
  id: "audius:example",
  providerId: "example",
  source: "audius",
  title: "A Little Light",
  artist: "Original Demo Artist",
  artwork: "",
  duration: 180,
};
const result = (patch: Record<string, unknown> = {}) => ({
  id: 12345,
  trackName: track.title,
  artistName: track.artist,
  duration: 180,
  instrumental: false,
  syncedLyrics: original,
  plainLyrics: "Original demonstration only",
  ...patch,
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let originalFetch = globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  clearLyricsLookupCache();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  clearLyricsLookupCache();
});

test("lyrics lookup sends exact metadata with required client identification and returns record attribution", async () => {
  let url: URL | undefined;
  let client: string | null | undefined;
  globalThis.fetch = async (input, init) => {
    url = new URL(String(input));
    client = new Headers(init?.headers).get("Lrclib-Client");
    return json(
      result({
        trackName: "  A Little Light ",
        artistName: "original demo artist",
        duration: 181,
      }),
    );
  };
  assert.deepEqual(await fetchSyncedLyrics(track), {
    syncedLyrics: original,
    sourceUrl: "https://lrclib.net/tracks/12345",
  });
  assert.equal(url?.origin, "https://lrclib.net");
  assert.equal(url?.pathname, "/api/get");
  assert.equal(url?.searchParams.get("artist_name"), track.artist);
  assert.equal(url?.searchParams.get("track_name"), track.title);
  assert.equal(url?.searchParams.get("duration"), "180");
  assert.match(
    client ?? "",
    /^DashyMusic\/0\.2\.0 \(https:\/\/github\.com\/fizzberwyndash\/DashyMusic\)$/,
  );
});

test("unknown or invalid durations skip lookup instead of guessing a different version", async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return json(result());
  };
  for (const duration of [0, -1, NaN, Infinity, 3601])
    assert.equal(await fetchSyncedLyrics({ ...track, duration }), null);
  assert.equal(await fetchSyncedLyrics({ ...track, artist: "" }), null);
  assert.equal(requests, 0);
});

test("strict metadata, instrumental, untimed text and invalid timing never produce fake synchronized lyrics", async () => {
  for (const patch of [
    { trackName: "A Little Light (Live)" },
    { artistName: "Another Artist" },
    { duration: 182.1 },
    { instrumental: true },
    { syncedLyrics: null },
    { syncedLyrics: "These lines have no timestamps" },
    { syncedLyrics: "[04:00.00]Original line past this recording" },
    { id: "not-a-number" },
  ]) {
    clearLyricsLookupCache();
    globalThis.fetch = async () => json(result(patch));
    assert.equal(await fetchSyncedLyrics(track), null);
  }
});

test("404 is an ordinary no-lyrics result and caches repeated missing lookups", async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return json({ message: "No match" }, 404);
  };
  assert.equal(await fetchSyncedLyrics(track), null);
  assert.equal(await fetchSyncedLyrics(track), null);
  assert.equal(requests, 1);
});

test("successful lookups are cached and callers cannot mutate cached attribution", async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return json(result());
  };
  const first = await fetchSyncedLyrics(track);
  first!.sourceUrl = "https://other.example/changed";
  const second = await fetchSyncedLyrics(track);
  assert.equal(second!.sourceUrl, "https://lrclib.net/tracks/12345");
  assert.equal(requests, 1);
});

test("rate-limit Retry-After is respected without automatically retrying or exposing provider text", async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response("private service details", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  };
  await assert.rejects(fetchSyncedLyrics(track), /short break/);
  await assert.rejects(
    fetchSyncedLyrics({ ...track, title: "Another original demo" }),
    /short break/,
  );
  assert.equal(requests, 1);
});

test("non-JSON and connection errors are friendly; aborted requests preserve cancellation", async () => {
  globalThis.fetch = async () => new Response("private error body");
  await assert.rejects(fetchSyncedLyrics(track), /unreadable response/);
  globalThis.fetch = async () => {
    throw new Error("private network details");
  };
  await assert.rejects(
    fetchSyncedLyrics(track),
    /Could not reach the lyrics provider/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    fetchSyncedLyrics(track, controller.signal),
    (error) => (error as Error).name === "AbortError",
  );
});

test("in-flight cancellation aborts the underlying request and releases its concurrency slot", async () => {
  let underlyingAborted = false;
  globalThis.fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          underlyingAborted = true;
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        },
        { once: true },
      );
    });
  const controller = new AbortController();
  const pending = fetchSyncedLyrics(track, controller.signal);
  controller.abort();
  await assert.rejects(
    pending,
    (error) => (error as Error).name === "AbortError",
  );
  assert.equal(underlyingAborted, true);
  globalThis.fetch = async () => json(result());
  assert.ok(await fetchSyncedLyrics(track));
});

test("a stalled lyrics request times out with an actionable message", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  globalThis.fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        { once: true },
      );
    });
  const pending = fetchSyncedLyrics(track);
  context.mock.timers.tick(12_000);
  await assert.rejects(pending, /Lyrics lookup took too long/);
});
