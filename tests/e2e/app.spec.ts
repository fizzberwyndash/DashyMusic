import { Buffer } from 'node:buffer';
import { test, expect, type Page } from '@playwright/test';

/**
 * YouTube is deliberately mocked: these tests exercise app integration and UI,
 * not real video availability, streaming, captions, or native WebView behavior.
 */
const youtubeScript = String.raw`
window.__dashyYT = { instances: [], commands: [] };
window.YT = { Player: class {
  constructor(host, options) {
    this.options = options;
    this.time = 0;
    this.duration = 180;
    this.destroyed = false;
    this.iframe = document.createElement('iframe');
    const query = new URLSearchParams(options.playerVars);
    this.iframe.src = 'https://www.youtube.com/embed/' + options.videoId + '?' + query;
    this.iframe.width = options.width;
    this.iframe.height = options.height;
    this.iframe.title = 'Mock YouTube player';
    host.replaceWith(this.iframe);
    window.__dashyYT.instances.push(this);
    setTimeout(() => { if (!this.destroyed) options.events.onReady(); }, 0);
  }
  playVideo() { window.__dashyYT.commands.push({ method: 'play', videoId: this.options.videoId }); this.options.events.onStateChange({ data: 1 }); }
  pauseVideo() { window.__dashyYT.commands.push({ method: 'pause', videoId: this.options.videoId }); this.options.events.onStateChange({ data: 2 }); }
  seekTo(time) { this.time = time; window.__dashyYT.commands.push({ method: 'seek', time, videoId: this.options.videoId }); }
  getCurrentTime() { return this.time; }
  getDuration() { return this.duration; }
  getIframe() { return this.iframe; }
  destroy() { this.destroyed = true; this.iframe.remove(); window.__dashyYT.commands.push({ method: 'destroy', videoId: this.options.videoId }); }
} };
window.onYouTubeIframeAPIReady();
`;

type MockInstance = {
  time: number;
  destroyed: boolean;
  options: { videoId: string; playerVars: Record<string, string | number> };
};
declare global {
  interface Window {
    __dashyYT: {
      instances: MockInstance[];
      commands: { method: string; time?: number; videoId: string }[];
    };
  }
}

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/https:\/\/www\.youtube\.com\/iframe_api(?:\?.*)?$/, route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: youtubeScript,
  }));
  await page.route('https://www.youtube.com/embed/**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><html><body>Mock YouTube video — no media playback</body></html>',
  }));
  await page.route('https://i.ytimg.com/**', route => route.fulfill({
    status: 200, contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#234238"/></svg>',
  }));
  await page.goto('/');
  await expect(page.getByText('A soundtrack for today.', { exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page), 'No uncaught browser application errors').toEqual([]);
});

test('tabs and favorites persist across reload and can be removed', async ({ page }) => {
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await expect(page.getByText('Make yourself at home.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search songs or paste YouTube link' })).toBeVisible();
  await page.getByRole('button', { name: 'Save Blinding Lights', exact: true }).click();
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await expect(page.getByText('1 favorite · saved on this device')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Blinding Lights by The Weeknd', exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await expect(page.getByText('1 favorite · saved on this device')).toBeVisible();
  await page.getByRole('button', { name: 'Unsave Blinding Lights', exact: true }).click();
  await expect(page.getByText('Make yourself at home.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await expect(page.getByText('0 favorites · saved on this device')).toBeVisible();
});

test('no-key search explains setup; a video link opens the matching visible player and closes it', async ({ page }) => {
  let searchRequests = 0;
  page.on('request', request => { if (request.url().startsWith('https://www.googleapis.com/youtube/v3/search')) searchRequests += 1; });
  await page.getByRole('tab', { name: 'Search', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Search songs or paste YouTube link' });
  await input.fill('night drive');
  await page.getByRole('button', { name: 'Submit search', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Add a YouTube Data API key in Settings to search YouTube.');
  expect(searchRequests).toBe(0);

  await input.fill('https://youtu.be/JGwWNGJdvx8');
  await page.getByRole('button', { name: 'Submit search', exact: true }).click();
  const frame = page.locator('iframe[title="YouTube music video player"]');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', /\/embed\/JGwWNGJdvx8\?/);
  const bounds = await frame.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(200);
  expect(bounds?.height).toBeGreaterThanOrEqual(200);
  await expect(page.getByRole('button', { name: 'Import timed lyrics', exact: true })).toBeInViewport();
  await expect(page.getByText('Visible video playback · Captions supplied by YouTube', { exact: true })).toBeInViewport();
  expect(await page.evaluate(() => window.__dashyYT.instances.at(-1)?.options.playerVars)).toMatchObject({ autoplay: 0, controls: 1, cc_load_policy: 1 });
  await expect(page.getByRole('button', { name: 'Pause video', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Pause video', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Close player and pause', exact: true }).click();
  await expect(frame).toHaveCount(0);
  expect(await page.evaluate(() => window.__dashyYT.instances.at(-1)?.destroyed)).toBe(true);
  expect(await page.evaluate(() => window.__dashyYT.commands.map(command => command.method))).toContain('pause');
});

test('a saved search key is used for metadata search and can be removed', async ({ page }) => {
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByLabel('YouTube API key', { exact: true }).fill('browser-test-key-not-a-real-key');
  await page.getByRole('button', { name: /Save search key/ }).click();
  await expect(page.getByRole('button', { name: 'Close settings', exact: true })).toHaveCount(0);

  let observedSearch: URL | undefined;
  await page.route('https://www.googleapis.com/youtube/v3/search?**', route => {
    observedSearch = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{
      id: { videoId: 'JGwWNGJdvx8' }, snippet: { title: 'Glass &amp; Light', channelTitle: 'Test Artist', thumbnails: {} },
    }] }) });
  });
  await page.getByRole('tab', { name: 'Search', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search songs or paste YouTube link' }).fill('glass light');
  await page.getByRole('button', { name: 'Submit search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Glass & Light by Test Artist', exact: true })).toBeVisible();
  expect(observedSearch?.searchParams.get('q')).toBe('glass light');
  expect(observedSearch?.searchParams.get('key')).toBe('browser-test-key-not-a-real-key');
  expect(observedSearch?.searchParams.get('videoEmbeddable')).toBe('true');
  expect(observedSearch?.searchParams.get('videoSyndicated')).toBe('true');
  expect(observedSearch?.searchParams.get('type')).toBe('video');

  await page.reload();
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await expect(page.getByLabel('YouTube API key', { exact: true })).toHaveAttribute('placeholder', 'A key is configured. Paste to replace.');
  await page.getByRole('button', { name: 'Remove saved device key', exact: true }).click();
  await expect(page.getByLabel('YouTube API key', { exact: true })).toHaveAttribute('placeholder', 'Paste your API key');
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await page.reload();
  await page.getByRole('tab', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Video links work without a key. Add a free-quota API key for search.')).toBeVisible();
});

test('imported timed lyrics follow player progress, seek on tap, and persist', async ({ page }) => {
  await page.getByRole('button', { name: 'Open video player', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause video', exact: true })).toBeEnabled();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import timed lyrics', exact: true }).click();
  await (await chooser).setFiles({
    name: 'original-test-lyrics.lrc', mimeType: 'text/plain',
    buffer: Buffer.from('[00:00.00]First original test line\n[00:12.00]Second original test line\n[00:25.00]Third original test line'),
  });
  const first = page.getByText('First original test line', { exact: true });
  const second = page.getByText('Second original test line', { exact: true });
  const third = page.getByText('Third original test line', { exact: true });
  await expect(first).toHaveCSS('color', 'rgb(212, 247, 139)');
  await page.evaluate(() => { const instance = window.__dashyYT.instances.at(-1); if (instance) instance.time = 13; });
  await expect(second).toHaveCSS('color', 'rgb(212, 247, 139)');
  await expect(first).not.toHaveCSS('color', 'rgb(212, 247, 139)');
  await page.getByRole('button', { name: 'Seek to lyric: Third original test line', exact: true }).click();
  expect(await page.evaluate(() => window.__dashyYT.commands.filter(command => command.method === 'seek').at(-1)?.time)).toBe(25);
  await expect(third).toHaveCSS('color', 'rgb(212, 247, 139)');
  await page.getByRole('button', { name: 'Close player and pause', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open video player', exact: true }).click();
  await expect(first).toBeVisible();
});
