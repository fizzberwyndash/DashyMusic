# DashyMusic

A glass-inspired music companion for iPhone, built with Expo SDK 58 and React Native. Softly blurred video artwork fills the background, with a dark green palette, translucent controls, saved favorites, and a singing panel for timed lyrics.

This first version plays **visible YouTube videos in the foreground**. It is not an audio extraction or background streaming app.

## Try it on your iPhone from Windows

Get the source folder onto your PC first. If the project is available in your GitHub repository, choose **Code → Download ZIP** on GitHub and extract it. You can also use a source archive exported from the cloud workspace.

1. Install [Node.js 24 LTS](https://nodejs.org/) on Windows.
2. Install **Expo Go** on your iPhone. Use a version that supports this project's Expo SDK 58.
3. Open PowerShell in the downloaded `DashyMusic` folder and run:

   ```powershell
   npm ci
   npx expo start --lan
   ```

4. Connect your PC and iPhone to the same Wi-Fi network.
5. Scan the terminal's QR code with the iPhone Camera app, then open it in Expo Go.

Allow Node.js through Windows Firewall on your trusted private network if the phone cannot connect. Avoid a guest network that isolates devices. Leave the terminal running while you use the app.

If a local connection is unavailable, Expo also supports `npx expo start --tunnel`; tunnel mode requires Expo's ngrok support and an Internet connection. Follow the Expo CLI's installation instructions if it requests that dependency.

Windows cannot run Apple's iOS Simulator or Xcode. Testing on your physical iPhone through Expo Go is the intended starting workflow. A standalone iOS build can later use EAS Build, with Apple signing and the relevant Apple Developer membership. EAS distribution and App Store publication are not configured here.

## What works without a search key

- Browse eight curated YouTube video shortcuts.
- Paste a YouTube video link or video ID in Search and open its player.
- Save and remove favorites; they persist on this device.
- Use the visible player's play, pause, seeking, and previous/next controls.
- Import timed lyrics for a video and follow the highlighted line.

Video availability depends on YouTube, the uploader, your region, age restrictions, and embedding permissions. Some videos must be opened in YouTube instead. The app provides a fallback link when playback fails.

Favorites retain video IDs rather than caching API metadata indefinitely. Curated videos keep their built-in titles; other saved videos use a generic title after reopening the app.

## Enable YouTube search

YouTube Data API access includes a free quota; it is not unlimited. Check the current quota and requirements in your Google Cloud project rather than assuming every request is free or that a particular daily allowance applies.

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **YouTube Data API v3** and create an API key.
3. Restrict the key to the YouTube Data API and apply appropriate application restrictions for your deployment.
4. Open app settings, paste the key, and choose **Save search key**.

The app stores that key locally on your device and sends it to Google for search requests. It is not stored in an encrypted credential vault. A client-side API key is visible to the client and must not be treated as a protected server secret. Do not commit keys or send them in chat. A production app should review key restrictions, abuse controls, and any backend requirements before distribution.

As an alternative for local development, copy `.env.example` to `.env.local`, set `EXPO_PUBLIC_YOUTUBE_API_KEY`, and restart Expo. Variables beginning with `EXPO_PUBLIC_` are embedded in the client bundle. Removing a saved device key falls back to this configured development value if present.

Search uses official metadata endpoints for embeddable, syndicated music videos. It does not download media.

## Captions and singing lyrics

The YouTube player requests captions when available. Captions remain inside YouTube's video player and may depend on the video's caption tracks and player settings. The public Data API does not provide arbitrary creators' subtitle text for a separate singing view; caption downloads require authorization and suitable video permissions.

For the **Sing it back** panel, open a video and choose **Import .lrc**. Select a `.lrc` or `.txt` file containing timed lyrics you have permission to use. Lines highlight and scroll with the video; tap a line to seek. Each imported file is associated with the selected video and saved locally.

Example format, using original demonstration text that does **not** match the curated songs:

```text
[ar:Original demonstration]
[ti:A little light]
[00:00.00]A little light across the room
[00:05.00]A rhythm only we can hear
[00:10.00]Let every color find its tune
[00:15.00]And keep the moment close and clear
```

Multiple timestamps and an `[offset:+500]` metadata line are supported. Offsets use milliseconds. Files must be smaller than 1 MB and contain valid timestamps.

## Playback boundaries

The official embedded video stays visible, with YouTube controls and branding. Closing the player or leaving the app pauses playback. This YouTube version does not support locked-screen audio, background audio, offline media downloads, or audio-only playback.

Native WebView playback identifies the app using its configured bundle identifier, `com.dashymusic.app`. YouTube error 153 means player identification was not accepted. A deployment may need a real HTTPS application origin supplied as `EXPO_PUBLIC_PLAYER_ORIGIN`; use a host you control and restart Expo. Do not use an invented website or disable browser security to work around identification errors. Native behavior still needs validation on an iPhone.

## Development and checks

```powershell
npm ci
npm run check
npm run web
npm run export:web
```

| Command | Purpose |
| --- | --- |
| `npm start` | Start Expo and display the device connection instructions |
| `npm run web` | Start a browser development build |
| `npm run ios` | Open an iOS Simulator on a Mac with Xcode; unavailable on Windows |
| `npm run android` | Start an Android development session when an emulator/device is available |
| `npm run typecheck` | Check the TypeScript source |
| `npm test` | Run the domain tests for links, search responses, and lyric timing |
| `npm run check` | Run type checking and domain tests |
| `npm run export:web` | Generate a production web build in `dist` |
| `npm run export:ios` | Generate an iOS JavaScript/Hermes bundle; not a signed native app |
| `npm run iphone` | Start the LAN server for Expo Go on a physical iPhone |
| `npm run test:e2e` | Run browser integration tests with simulated YouTube responses |

For browser tests, start `npm run web -- --port 8081` in one terminal, then run `npx playwright install chromium` and `npm run test:e2e` in another. On Linux the configuration defaults to `/usr/bin/chromium`; override `PLAYWRIGHT_CHROMIUM_PATH` if needed. Use `PLAYWRIGHT_BASE_URL` to test another server address.

The completed cloud run passed TypeScript, 19 unit tests, 12 browser integration checks across desktop and two iPhone screen sizes, a web export, and an iOS JavaScript/Hermes export. The development server also rendered and navigated successfully. These results do not establish native iPhone or live YouTube playback. See [validation details](docs/VALIDATION.md).

The cloud workspace runs Linux and has no Xcode or iOS Simulator. Type checks, domain tests, and browser checks do not establish native playback readiness. Browser tests with mocked YouTube responses validate app behavior only; they do not validate real YouTube media playback. Official YouTube documentation and playback requests were restricted by the cloud network during development, so live playback and current provider quotas require confirmation outside that environment.

Before relying on the iPhone build, check the following on your physical device:

- Open a permitted YouTube video, start it, pause, seek, and switch videos.
- Confirm YouTube controls remain visible and captions appear for a captioned video.
- Close the player, lock the phone, and switch apps; playback should pause.
- Import a timed lyric file for the selected video, check highlighting, and tap a line to seek.
- Save a favorite, close and reopen the app, and confirm the favorite and imported lyrics persist.
- Add a restricted search key, run a search, and check unavailable-video and quota errors.

## Provider references

- [YouTube API getting started](https://developers.google.com/youtube/v3/getting-started)
- [Quota costs](https://developers.google.com/youtube/v3/determine_quota_cost)
- [Search endpoint](https://developers.google.com/youtube/v3/docs/search/list)
- [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [Player parameters and captions](https://developers.google.com/youtube/player_parameters)
- [Caption download permissions](https://developers.google.com/youtube/v3/docs/captions/download)
- [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies)
