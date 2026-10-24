/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { playerHtml } from '../src/components/playerHtml';
import { parsePlayerMessage } from '../src/components/playerTypes';

type PlayerOptions = {
  videoId: string;
  playerVars: Record<string, string | number>;
  events: { onReady(): void; onStateChange(event: { data: number }): void; onError(event: { data: number }): void };
};

/** Execute the real generated WebView script with a fake clock and YouTube API. */
function nativeHarness() {
  let now = 0;
  let nextId = 1;
  let options: PlayerOptions | undefined;
  let script: { onerror?: () => void } | undefined;
  let pauses = 0;
  let constructions = 0;
  const messages: Record<string, unknown>[] = [];
  const timers = new Map<number, { at: number; run: () => void; interval?: number }>();
  const listeners: Record<string, () => void> = {};
  const schedule = (run: () => void, milliseconds: number, interval?: number) => {
    const id = nextId++;
    timers.set(id, { at: now + milliseconds, run, interval });
    return id;
  };
  const player = { getCurrentTime: () => 12.5, getDuration: () => 180, pauseVideo: () => { pauses += 1; } };
  const window = {
    ReactNativeWebView: { postMessage: (raw: string) => messages.push(JSON.parse(raw)) },
    addEventListener: (name: string, callback: () => void) => { listeners[name] = callback; },
    onYouTubeIframeAPIReady: undefined as (() => void) | undefined,
  };
  const document = {
    hidden: false,
    createElement: () => ({}),
    head: { appendChild: (element: typeof script) => { script = element; } },
    addEventListener: (name: string, callback: () => void) => { listeners[name] = callback; },
  };
  const html = playerHtml('4NRXx6U8ABQ', 'https://com.dashymusic.app');
  const javascript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(javascript);
  vm.runInNewContext(javascript, {
    window, document,
    YT: { Player: function (_element: string, config: PlayerOptions) { options = config; constructions += 1; return player; } },
    setTimeout: (run: () => void, ms: number) => schedule(run, ms),
    setInterval: (run: () => void, ms: number) => schedule(run, ms, ms),
    clearTimeout: (id: number) => timers.delete(id),
    clearInterval: (id: number) => timers.delete(id),
  });
  return {
    messages, timers, document,
    apiReady: () => window.onYouTubeIframeAPIReady?.(),
    ready: () => options?.events.onReady(),
    state: (data: number) => options?.events.onStateChange({ data }),
    error: (data: number) => options?.events.onError({ data }),
    networkError: () => script?.onerror?.(),
    hide: () => listeners.pagehide?.(),
    visibilityChange: () => listeners.visibilitychange?.(),
    get options() { return options; },
    get pauses() { return pauses; },
    get constructions() { return constructions; },
    advance(ms: number) {
      const end = now + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.at;
        if (timer.interval) timers.set(id, { ...timer, at: now + timer.interval });
        else timers.delete(id);
        timer.run();
      }
      now = end;
    },
  };
}

test('native player reports one bounded timeout if the API cannot load, and ignores late API readiness', () => {
  const app = nativeHarness();
  app.advance(19999);
  assert.equal(app.messages.length, 0);
  app.advance(1);
  assert.deepEqual(app.messages, [{ type: 'ready-timeout' }]);
  app.advance(40000);
  app.apiReady();
  assert.equal(app.constructions, 0);
  assert.equal(app.timers.size, 0);
});

test('native iframe readiness has a deadline even after the API loaded', () => {
  const app = nativeHarness();
  app.apiReady();
  assert.equal(app.constructions, 1);
  app.advance(20000);
  assert.deepEqual(app.messages, [{ type: 'ready-timeout' }]);
  app.ready();
  app.advance(1000);
  assert.deepEqual(app.messages, [{ type: 'ready-timeout' }]);
  assert.ok(app.pauses >= 1);
  assert.equal(app.timers.size, 0);
});

test('native readiness clears timeout, emits ready once, polls real progress, and preserves captions and controls', () => {
  const app = nativeHarness();
  app.apiReady();
  app.apiReady();
  assert.equal(app.constructions, 1);
  assert.equal(app.options?.videoId, '4NRXx6U8ABQ');
  assert.equal(app.options?.playerVars.autoplay, 0);
  assert.equal(app.options?.playerVars.controls, 1);
  assert.equal(app.options?.playerVars.cc_load_policy, 1);
  app.ready();
  app.ready();
  app.advance(21000);
  assert.equal(app.messages.filter(message => message.type === 'ready').length, 1);
  assert.equal(app.messages.filter(message => message.type === 'ready-timeout').length, 0);
  assert.ok(app.messages.some(message => message.type === 'progress' && message.time === 12.5 && message.duration === 180));
  app.state(1);
  assert.ok(app.messages.some(message => message.type === 'state' && message.state === 1));
  app.document.hidden = true;
  app.visibilityChange();
  assert.equal(app.pauses, 1);
  app.hide();
  const count = app.messages.length;
  app.advance(40000);
  app.ready();
  app.state(1);
  assert.equal(app.messages.length, count);
  assert.equal(app.timers.size, 0);
});

test('native network errors and page teardown cancel readiness timers', () => {
  const failed = nativeHarness();
  failed.networkError();
  failed.networkError();
  failed.advance(30000);
  assert.deepEqual(failed.messages, [{ type: 'network-error' }]);
  assert.equal(failed.timers.size, 0);
  const closed = nativeHarness();
  closed.hide();
  closed.advance(30000);
  assert.deepEqual(closed.messages, []);
  assert.equal(closed.timers.size, 0);
});

test('native player errors stop progress polling and do not emit duplicate errors or timeouts', () => {
  const app = nativeHarness();
  app.apiReady();
  app.ready();
  app.error(100);
  app.error(100);
  const count = app.messages.length;
  app.advance(30000);
  assert.equal(app.messages.length, count);
  assert.deepEqual(app.messages.filter(message => message.type === 'error'), [{ type: 'error', code: 100 }]);
  assert.equal(app.timers.size, 0);
});

test('bridge parser rejects primitives, malformed fields, and nonfinite values without throwing', () => {
  for (const value of ['null', 'false', '3', '"ready"', '[]', '{', '{}', '{"type":"unknown"}', '{"type":"state","state":"1"}', '{"type":"progress","time":1e999,"duration":30}']) {
    assert.equal(parsePlayerMessage(value), null, value);
  }
  assert.deepEqual(parsePlayerMessage('{"type":"ready-timeout"}'), { type: 'ready-timeout' });
  assert.deepEqual(parsePlayerMessage('{"type":"progress","time":12.5,"duration":30}'), { type: 'progress', time: 12.5, duration: 30 });
});

test('player HTML rejects malformed video IDs before creating executable HTML', () => {
  assert.throws(() => playerHtml('<script>alert(1)</script>', 'https://com.dashymusic.app'), /Invalid YouTube video ID/);
});
