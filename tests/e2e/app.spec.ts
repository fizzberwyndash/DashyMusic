import { Buffer } from 'node:buffer';
import { test, expect, type Page } from '@playwright/test';

/** Deterministic browser integration only: controllable HTMLAudioElements emit
 * DOM media events. These doubles verify transport commands and fade logic;
 * they do not verify real provider streams, iOS audio or real YouTube playback. */
const mediaScript = String.raw`
window.__dashyAudio = [];
const BrowserAudio = window.Audio;
window.Audio = function () {
  const audio = new BrowserAudio();
  const state = { paused: true, time: 0, duration: 120, ready: 0, ended: false, source: '', commands: [] };
  window.__dashyAudio.push({ audio, state });
  const emit = type => audio.dispatchEvent(new Event(type));
  Object.defineProperties(audio, {
    paused: { get: () => state.paused },
    currentTime: { get: () => state.time, set: value => { state.time = value; state.ended = false; state.commands.push({ method: 'seek', value }); emit('seeked'); emit('timeupdate'); } },
    duration: { get: () => state.duration }, readyState: { get: () => state.ready },
    ended: { get: () => state.ended }, seeking: { get: () => false },
    src: { get: () => state.source, set: value => { state.source = value; state.ready = 0; state.time = 0; state.ended = false; } },
  });
  audio.load = () => { if (!state.source) return; queueMicrotask(() => { state.ready = 4; emit('loadedmetadata'); emit('canplay'); }); };
  audio.play = async () => { state.commands.push({ method: 'play' }); state.paused = false; emit('playing'); };
  audio.pause = () => { state.commands.push({ method: 'pause' }); state.paused = true; emit('pause'); };
  return audio;
};
`;
const youtubeScript = String.raw`
window.__dashyYT = { instances: [], commands: [] };
window.YT = { Player: class {
  constructor(host, options) {
    this.options = options; this.time = 0; this.duration = 180; this.destroyed = false;
    this.iframe = document.createElement('iframe');
    this.iframe.src = 'https://www.youtube.com/embed/' + options.videoId + '?' + new URLSearchParams(options.playerVars);
    this.iframe.width = options.width; this.iframe.height = options.height;
    host.replaceWith(this.iframe); window.__dashyYT.instances.push(this);
    setTimeout(() => { if (!this.destroyed) options.events.onReady(); }, 0);
  }
  playVideo() { window.__dashyYT.commands.push({ method: 'play', videoId: this.options.videoId }); this.options.events.onStateChange({ data: 1 }); }
  pauseVideo() { window.__dashyYT.commands.push({ method: 'pause', videoId: this.options.videoId }); this.options.events.onStateChange({ data: 2 }); }
  seekTo(time) { this.time = time; window.__dashyYT.commands.push({ method: 'seek', time, videoId: this.options.videoId }); }
  getCurrentTime() { return this.time; } getDuration() { return this.duration; } getIframe() { return this.iframe; }
  destroy() { this.pauseVideo(); this.destroyed = true; this.iframe.remove(); window.__dashyYT.commands.push({ method: 'destroy', videoId: this.options.videoId }); }
} };
window.onYouTubeIframeAPIReady();
`;
declare global {
  interface Window {
    __dashyAudio: { audio: HTMLAudioElement; state: { paused: boolean; source: string; commands: { method: string; value?: number }[] } }[];
    __dashyYT: {
      instances: { destroyed: boolean; options: { videoId: string; playerVars: Record<string, string | number> } }[];
      commands: { method: string; time?: number; videoId: string }[];
    };
  }
}
const tracks = [
  { id: 'test-dawn', title: 'Original Dawn', duration: 120, is_streamable: true, user: { name: 'Test Ensemble' }, artwork: {}, permalink: '/test-ensemble/original-dawn', genre: 'Electronic' },
  { id: 'test-neon', title: 'Original Neon', duration: 120, is_streamable: true, user: { name: 'Test Ensemble' }, artwork: {}, permalink: '/test-ensemble/original-neon', genre: 'Electronic' },
  { id: 'test-orbit', title: 'Original Orbit', duration: 120, is_streamable: true, user: { name: 'Test Ensemble' }, artwork: {}, permalink: '/test-ensemble/original-orbit', genre: 'Jazz' },
];
const runtimeErrors = new WeakMap<Page, string[]>();
const catalogRequests = new WeakMap<Page, URL[]>();
function originalWav() {
  const samples = 8_000;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(samples, 24); buffer.writeUInt32LE(samples * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let sample = 0; sample < samples; sample += 1) buffer.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * sample / samples) * 1_000), 44 + sample * 2);
  return buffer;
}
async function stored(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('dashy:library:v2') || 'null')); }
async function openSearch(page: Page) {
  await page.getByRole('tab', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search music', exact: true })).toBeVisible();
}
async function startMusic(page: Page) {
  await openSearch(page);
  await page.getByRole('button', { name: 'Play Original Dawn by Test Ensemble', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause song', exact: true })).toBeVisible();
}
async function moveSlider(page: Page, name: string, value: number, max: number) {
  const slider = page.getByRole('slider', { name, exact: true });
  await slider.scrollIntoViewIfNeeded();
  await slider.focus();
  if (value === max) await slider.press('End');
  else {
    const delta = Math.round((value - Number(await slider.inputValue())) * 10);
    for (let step = 0; step < Math.abs(delta); step += 1) await slider.press(delta > 0 ? 'ArrowRight' : 'ArrowLeft');
  }
  await expect(slider).toHaveAttribute('aria-valuenow', String(value));
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; const requests: URL[] = [];
  runtimeErrors.set(page, errors); catalogRequests.set(page, requests);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(mediaScript);
  await page.route('https://lrclib.net/api/**', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.route('https://api.audius.co/v1/**', route => {
    const url = new URL(route.request().url()); requests.push(url);
    const query = url.searchParams.get('query');
    if (query === 'catalog failure') return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: query === 'empty frequency' ? [] : tracks }) });
  });
  await page.route(/https:\/\/www\.youtube\.com\/iframe_api(?:\?.*)?$/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: youtubeScript }));
  await page.route('https://www.youtube.com/embed/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>Mock visible video. No media streaming.</body></html>' }));
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#234238"/></svg>' }));
  await page.goto('/');
  await expect(page.getByText('Free music, new discoveries', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Start AutoMix/ })).toBeEnabled();
});
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page), 'No uncaught browser application errors').toEqual([]); });

test('free catalog and Audius search work without a search key', async ({ page }) => {
  await expect(page.getByText('3 songs · free Audius streaming', { exact: true })).toBeVisible();
  await openSearch(page);
  await expect(page.getByRole('button', { name: 'Audius', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('textbox', { name: 'Search music', exact: true }).fill('original signal');
  await page.getByRole('button', { name: 'Submit search', exact: true }).click();
  await expect(page.getByText('Search results', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Original Neon by Test Ensemble', exact: true }).last()).toBeVisible();
  const request = catalogRequests.get(page)?.find(url => url.pathname.endsWith('/search'));
  expect(request?.searchParams.get('query')).toBe('original signal');
  expect(request?.searchParams.get('app_name')).toBe('DashyMusic'); expect(request?.searchParams.has('key')).toBe(false);
});
test('empty results and catalog failure explain the state and recover', async ({ page }) => {
  await openSearch(page);
  const input = page.getByRole('textbox', { name: 'Search music', exact: true });
  await input.fill('empty frequency'); await page.getByRole('button', { name: 'Submit search', exact: true }).click();
  await expect(page.getByText('Another frequency?', { exact: true })).toBeVisible();
  await expect(page.getByText(/No playable tracks matched/)).toBeVisible();
  await input.fill('catalog failure'); await page.getByRole('button', { name: 'Submit search', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'The music catalog is temporarily unavailable. Please try again.' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Try again/ })).toBeVisible();
  await input.fill('original signal'); await page.getByRole('button', { name: 'Submit search', exact: true }).click();
  await expect(page.getByText('Search results', { exact: true })).toBeVisible();
  await expect(page.getByText('A moment of silence.', { exact: true })).toHaveCount(0);
});
test('favorites persist across reload and can be removed', async ({ page }) => {
  await openSearch(page); await page.getByRole('button', { name: 'Save Original Dawn', exact: true }).click();
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open liked songs, 1 tracks', exact: true })).toBeVisible();
  await expect.poll(async () => (await stored(page))?.favoriteIds).toEqual(['audius:test-dawn']);
  await page.reload(); await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Open liked songs, 1 tracks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Original Dawn by Test Ensemble', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unsave Original Dawn', exact: true }).click();
  await expect.poll(async () => (await stored(page))?.favoriteIds).toEqual([]);
});
test('an unreadable saved library preserves older data while new session changes remain usable', async ({ page }) => {
  const key = 'dashy:library:v2';
  const prior = JSON.stringify({
    version: 2,
    tracks: [{ id: 'audius:test-orbit', providerId: 'test-orbit', source: 'audius', title: 'Original Orbit', artist: 'Test Ensemble', artwork: '', duration: 120 }],
    favoriteIds: ['audius:test-orbit'], recentIds: [], playlists: [], lyrics: {},
    audioSettings: { crossfadeSeconds: 6, fadeInSeconds: 0.8, fadeOutSeconds: 1.2, curve: 'equalPower', repeat: 'off', sleepAt: null },
    youtubeKey: '',
  });
  await page.clock.install();
  await page.addInitScript(({ key, prior }) => {
    const originalGet = Storage.prototype.getItem;
    localStorage.setItem(key, prior);
    Storage.prototype.getItem = function (this: Storage, name: string) {
      if (this === localStorage && name === key) throw new Error('Simulated saved-library read failure');
      return originalGet.call(this, name);
    };
    (window as unknown as { __readOriginalLibrary: () => string | null }).__readOriginalLibrary = () => originalGet.call(localStorage, key);
  }, { key, prior });
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText('Your saved library could not be read. Changes will stay in this session; reopen the app to retry.');
  await openSearch(page);
  await page.getByRole('button', { name: 'Save Original Dawn', exact: true }).click();
  await page.getByRole('button', { name: 'Play Original Dawn by Test Ensemble', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause song', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse player', exact: true }).click();
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open liked songs, 1 tracks', exact: true })).toBeVisible();
  // Advance the browser through normal deferred saves before examining the
  // original storage API. The UI remains available despite the failed read.
  await page.clock.fastForward(2_000);
  const actual = await page.evaluate(() => (window as unknown as { __readOriginalLibrary: () => string | null }).__readOriginalLibrary());
  expect(actual).toBe(prior);
});
test('playlist creation, adding songs, playback and storage work together', async ({ page }) => {
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
  await page.getByRole('textbox', { name: 'Playlist name', exact: true }).fill('Original night drive');
  await page.getByRole('checkbox', { name: 'Add Original Dawn', exact: true }).click();
  await page.getByRole('button', { name: /Create playlist/ }).last().click();
  await expect(page.getByRole('button', { name: 'Play Original Dawn by Test Ensemble', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add songs to playlist', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Add Original Dawn', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Add Original Neon', exact: true }).click();
  await page.getByRole('button', { name: /Save songs/ }).click();
  await page.getByRole('button', { name: /Play collection/ }).click();
  await expect(page.getByRole('button', { name: 'Pause song', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Up next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Original Neon by Test Ensemble', exact: true }).last()).toBeVisible();
  await expect.poll(async () => (await stored(page))?.playlists[0]?.trackIds).toEqual(['audius:test-dawn', 'audius:test-neon']);
  await page.reload(); await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Open playlist Original night drive', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Original Neon by Test Ensemble', exact: true }).last()).toBeVisible();
});
test('browser audio import plays this session and is excluded from persisted files', async ({ page }) => {
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import audio/ }).first().click();
  await (await chooser).setFiles({ name: 'Original_local.wav', mimeType: 'audio/wav', buffer: originalWav() });
  await expect(page.getByRole('button', { name: 'Open imported music, 1 tracks', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('for this browser session');
  await page.getByRole('button', { name: 'Open imported music, 1 tracks', exact: true }).click();
  await page.getByRole('button', { name: 'Play Original local by Your library', exact: true }).click();
  await expect(page.getByText('YOUR PERSONAL COLLECTION', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause song', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__dashyAudio.some(item => item.state.source.startsWith('blob:') && !item.state.paused))).toBe(true);
  await expect.poll(async () => (await stored(page))?.tracks.filter((track: { source: string }) => track.source === 'local').length).toBe(0);
  await page.reload(); await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open imported music, 0 tracks', exact: true })).toBeVisible();
});
test('collapse keeps audio playing and mini-player pause, resume and next control transports', async ({ page }) => {
  await startMusic(page); await page.getByRole('tab', { name: 'Up next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Original Neon by Test Ensemble', exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Collapse player', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause music', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__dashyAudio.find(item => item.state.source.includes('test-dawn'))?.state.paused)).toBe(false);
  await page.getByRole('button', { name: 'Pause music', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play music', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__dashyAudio.every(item => item.state.paused))).toBe(true);
  await page.getByRole('button', { name: 'Play music', exact: true }).click(); await page.getByRole('button', { name: 'Next song', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open player for Original Neon', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__dashyAudio.some(item => item.state.source.includes('test-neon') && !item.state.paused))).toBe(true);
});
test('timed lyrics import, seek and persist with the saved song', async ({ page }) => {
  await startMusic(page);
  await expect(page.getByText('No matching timed lyrics found. You can add a .lrc file.', { exact: true })).toBeVisible();
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Import timed lyrics', exact: true }).click();
  await (await chooser).setFiles({ name: 'original-lines.lrc', mimeType: 'text/plain', buffer: Buffer.from('[00:00.00]Original first line\n[00:12.00]Original second line\n[00:25.00]Original third line') });
  await page.getByRole('button', { name: 'Seek to lyric: Original third line', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__dashyAudio.find(item => item.state.source.includes('test-dawn'))?.audio.currentTime)).toBe(25);
  await expect(page.getByText('0:25', { exact: true })).toBeVisible();
  await expect.poll(async () => (await stored(page))?.lyrics['audius:test-dawn']).toContain('Original third line');
  await page.reload(); await startMusic(page);
  await expect(page.getByRole('button', { name: 'Seek to lyric: Original third line', exact: true })).toBeVisible();
});
test('matching remote lyrics show attribution, follow playback and seek without persisting provider lyrics', async ({ page }) => {
  let observed: URL | undefined;
  await page.route('https://lrclib.net/api/get?**', route => {
    observed = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      id: 123, trackName: 'Original Dawn', artistName: 'Test Ensemble', duration: 120,
      syncedLyrics: '[00:00.00]Original remote dawn\n[00:12.00]Original remote glow',
    }) });
  });
  await startMusic(page);
  await expect(page.getByRole('link', { name: /Lyrics from LRCLIB/ })).toBeVisible();
  const first = page.getByRole('button', { name: 'Seek to lyric: Original remote dawn', exact: true });
  const second = page.getByRole('button', { name: 'Seek to lyric: Original remote glow', exact: true });
  expect(observed?.searchParams.get('artist_name')).toBe('Test Ensemble');
  expect(observed?.searchParams.get('track_name')).toBe('Original Dawn');
  expect(observed?.searchParams.get('duration')).toBe('120');
  const firstColor = await first.locator('div').first().evaluate(element => getComputedStyle(element).color);
  await expect(second.locator('div').first()).not.toHaveCSS('color', firstColor);
  await second.click();
  await expect.poll(() => page.evaluate(() => window.__dashyAudio.find(item => item.state.source.includes('test-dawn'))?.audio.currentTime)).toBe(12);
  await expect(second.locator('div').first()).toHaveCSS('color', firstColor);
  await expect(first.locator('div').first()).not.toHaveCSS('color', firstColor);
  await page.getByRole('button', { name: 'Save current song', exact: true }).click();
  await expect.poll(async () => (await stored(page))?.favoriteIds).toContain('audius:test-dawn');
  expect(Object.keys((await stored(page)).lyrics)).toEqual([]);
});
test('AutoMix settings commit slider values, curve, repeat and sleep timer', async ({ page }) => {
  test.setTimeout(45_000);
  await page.getByRole('tab', { name: 'AutoMix', exact: true }).click();
  await moveSlider(page, 'Crossfade duration', 2.5, 12); await moveSlider(page, 'Intro fade', 3, 3); await moveSlider(page, 'Outro fade', 0.5, 3);
  await page.getByRole('button', { name: 'Even blend, Linear', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Even blend, Linear', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '30 min', exact: true }).click(); await expect(page.getByText('30 min left', { exact: true })).toBeVisible();
  await expect.poll(async () => (await stored(page))?.audioSettings).toMatchObject({
    crossfadeSeconds: 2.5, fadeInSeconds: 3, fadeOutSeconds: 0.5, curve: 'linear', sleepAt: expect.any(Number),
  });
  const settings = (await stored(page)).audioSettings;
  expect(settings).toMatchObject({ fadeInSeconds: 3, fadeOutSeconds: 0.5, curve: 'linear' }); expect(settings.sleepAt - Date.now()).toBeGreaterThan(29 * 60_000);
  await page.getByRole('switch', { name: 'Enable crossfade', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Crossfade duration', exact: true })).toBeDisabled();
  await expect.poll(async () => (await stored(page))?.audioSettings.crossfadeSeconds).toBe(0);
  await page.getByRole('switch', { name: 'Enable crossfade', exact: true }).click();
  await expect(page.getByText('2.5s', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Off', exact: true }).click(); await expect(page.getByText('Sleep timer off', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Play Original Dawn by Test Ensemble', exact: true }).click();
  await page.getByRole('button', { name: 'Repeat off', exact: true }).click(); await page.getByRole('button', { name: 'Repeat all', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Repeat one', exact: true })).toBeVisible();
  await expect.poll(async () => (await stored(page))?.audioSettings.repeat).toBe('one');
  await page.reload(); await page.getByRole('tab', { name: 'AutoMix', exact: true }).click();
  await expect(page.getByText('2.5s', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Even blend, Linear', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
test('crossfade starts the queued transport and pause stops both overlapping songs', async ({ page }) => {
  await startMusic(page);
  await page.evaluate(() => { const item = window.__dashyAudio.find(item => item.state.source.includes('test-dawn')); if (item) item.audio.currentTime = 115; });
  await expect(page.getByText('BLENDING INTO YOUR NEXT SONG', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__dashyAudio.filter(item => !item.state.paused).length)).toBe(2);
  await page.evaluate(() => { const item = window.__dashyAudio.find(item => item.state.source.includes('test-neon')); if (item) item.audio.currentTime = 3; });
  await expect.poll(() => page.evaluate(() => window.__dashyAudio.filter(item => !item.state.paused).map(item => Number(item.audio.volume.toFixed(4))))).toEqual([0.7071, 0.7071]);
  await page.getByRole('button', { name: 'Pause song', exact: true }).click();
  expect(await page.evaluate(() => window.__dashyAudio.every(item => item.state.paused))).toBe(true);
  await expect(page.getByRole('button', { name: 'Play song', exact: true })).toBeVisible();
});
test('an audio stream error stops playback and the next song can recover', async ({ page }) => {
  await startMusic(page);
  await page.evaluate(() => window.__dashyAudio.find(item => item.state.source.includes('test-dawn'))?.audio.dispatchEvent(new Event('error')));
  await expect(page.getByRole('alert').filter({ hasText: /This audio stream could not be played/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play song', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__dashyAudio.every(item => item.state.paused))).toBe(true);
  await page.getByRole('button', { name: 'Next song', exact: true }).last().click();
  await page.getByRole('button', { name: 'Play song', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause song', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__dashyAudio.some(item => item.state.source.includes('test-neon') && !item.state.paused))).toBe(true);
  await expect(page.getByRole('alert').filter({ hasText: /This audio stream could not be played/ })).toHaveCount(0);
});
test('YouTube no-key search explains setup and direct video pauses when hidden and closes', async ({ page }) => {
  let requests = 0; page.on('request', request => { if (request.url().includes('googleapis.com/youtube/v3/search')) requests += 1; });
  await openSearch(page); await page.getByRole('button', { name: 'YouTube', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Search music', exact: true });
  await input.fill('night drive'); await page.getByRole('button', { name: 'Submit search', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Add a YouTube Data API key in Settings to search YouTube.' }).first()).toBeVisible(); expect(requests).toBe(0);
  await input.fill('https://youtu.be/JGwWNGJdvx8'); await page.getByRole('button', { name: 'Submit search', exact: true }).click();
  await page.getByRole('button', { name: 'Play Shape of You by Ed Sheeran', exact: true }).click();
  const frame = page.locator('iframe[title="YouTube music video player"]');
  await expect(frame).toBeVisible(); await expect(frame).toHaveAttribute('src', /\/embed\/JGwWNGJdvx8\?/);
  const bounds = await frame.boundingBox();
  expect(Math.round(bounds?.width ?? 0)).toBeGreaterThanOrEqual(200);
  expect(Math.round(bounds?.height ?? 0)).toBeGreaterThanOrEqual(200);
  expect(await page.evaluate(() => window.__dashyYT.instances.at(-1)?.options.playerVars)).toMatchObject({ autoplay: 0, controls: 1, cc_load_policy: 1 });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await page.evaluate(() => window.__dashyYT.commands.map(command => command.method))).toContain('pause');
  await page.getByRole('button', { name: 'Close video player', exact: true }).click(); await expect(frame).toHaveCount(0);
  expect(await page.evaluate(() => window.__dashyYT.instances.at(-1)?.destroyed)).toBe(true);
});
test('a device key enables YouTube metadata search and can be removed', async ({ page }) => {
  await page.getByRole('button', { name: 'Open app settings', exact: true }).last().click();
  await page.getByRole('textbox', { name: 'YouTube API key', exact: true }).fill('browser-test-key-not-real');
  await page.getByRole('button', { name: /Save search key/ }).click(); await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  let observed: URL | undefined;
  await page.route('https://www.googleapis.com/youtube/v3/search?**', route => {
    observed = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: { videoId: 'JGwWNGJdvx8' }, snippet: { title: 'Original &amp; Light', channelTitle: 'Test Artist', thumbnails: {} } }] }) });
  });
  await openSearch(page); await page.getByRole('button', { name: 'YouTube', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search music', exact: true }).fill('original light'); await page.getByRole('button', { name: 'Submit search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Original & Light by Test Artist', exact: true })).toBeVisible();
  expect(observed?.searchParams.get('key')).toBe('browser-test-key-not-real'); expect(observed?.searchParams.get('videoEmbeddable')).toBe('true'); expect(observed?.searchParams.get('type')).toBe('video');
  await expect.poll(async () => (await stored(page))?.youtubeKey).toBe('browser-test-key-not-real');
  await page.reload(); await page.getByRole('button', { name: 'Open app settings', exact: true }).last().click();
  await expect(page.getByRole('textbox', { name: 'YouTube API key', exact: true })).toHaveAttribute('placeholder', 'A search key is configured');
  await page.getByRole('button', { name: /Remove device key/ }).click(); await expect.poll(async () => (await stored(page))?.youtubeKey).toBe('');
});
test('Spotify and SoundCloud identify external search and open the service query', async ({ page }) => {
  await page.evaluate(() => { (window as unknown as { __openedLinks: string[] }).__openedLinks = []; window.open = ((url: string | URL | undefined) => { (window as unknown as { __openedLinks: string[] }).__openedLinks.push(String(url)); return null; }) as typeof window.open; });
  await openSearch(page); await page.getByRole('textbox', { name: 'Search music', exact: true }).fill('original signal');
  for (const source of ['Spotify', 'SoundCloud']) {
    await page.getByRole('button', { name: `${source} external search`, exact: true }).click();
    await expect(page.getByText('EXTERNAL SEARCH', { exact: true })).toBeVisible(); await expect(page.getByText(/Playback happens in their service/)).toBeVisible();
    await page.getByRole('button', { name: new RegExp(`Search on ${source}`) }).click();
  }
  expect(await page.evaluate(() => (window as unknown as { __openedLinks: string[] }).__openedLinks)).toEqual(['https://open.spotify.com/search/original%20signal', 'https://soundcloud.com/search/sounds?q=original%20signal']);
});
