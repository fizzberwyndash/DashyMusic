# DashyMusic

A purple-and-cyan glass music app for iPhone, built with Expo SDK 58 and React Native. The player uses each track's artwork as a soft, animated background, with real music discovery, personal playlists, and adjustable transitions. [View the UI previews](docs/screenshots/).

## Choose how to try it

| Setup | What you can use | What it requires |
| --- | --- | --- |
| Expo Go on your iPhone | New interface, real Audius streaming, local imports, playlists, and foreground AutoMix preview | Windows PC, Node.js 24, free Expo account, compatible Expo Go |
| Installed iOS development build | Custom native audio engine, background queue/fades, lock-screen controls, and system AirPlay picker | EAS project access, registered iPhone, and paid Apple Developer membership for EAS internal distribution |
| Installed iOS preview build | Same native features, with the JavaScript bundle included so Metro is unnecessary | The same Apple signing and registered-device requirements |

**You do not need an Apple Developer membership to start with Expo Go.** Expo Go cannot contain this project's custom Swift module, so it does not validate reliable crossfades while your screen is locked. Windows plus a free Apple account cannot produce the EAS ad hoc iPhone build described here. The free Apple Personal Team route requires a Mac and Xcode, uses short-lived provisioning, and is a different workflow. See [iOS build and signing instructions](docs/IOS-BUILD.md).

## Start on Windows

Update an existing Git clone from its folder:

```powershell
git status
git pull --ff-only origin main
```

Preserve any personal changes before pulling. For a fresh copy, use the repository's **Code → Download ZIP** and extract it, or:

```powershell
git clone https://github.com/fizzberwyndash/DashyMusic.git
cd DashyMusic
```

Install [Node.js 24 LTS](https://nodejs.org/), then open PowerShell in the folder containing `package.json`:

```powershell
npm.cmd ci
npx.cmd expo login --no-browser --username andredash
npx.cmd expo whoami
npm.cmd run iphone
```

Replace `andredash` if your Expo username is different. Enter your password only at the CLI's private prompt; do not place it in a command or send it in chat. The `--no-browser` flag avoids browser-login handoff problems. Expo's login command does not support a `--force` flag. If you need to change accounts, run `npx.cmd expo logout`, then log in again.

Install an **Expo Go version supporting SDK 58** on your iPhone. Sign in to the same Expo account shown by `expo whoami`. Keep the phone and PC on the same Wi-Fi, scan the terminal's QR code with the iPhone Camera, and open the link in Expo Go. If the terminal is targeting a development build, press `s` to switch its target to Expo Go.

Leave the terminal running. Allow Node.js through Windows Firewall on your trusted private network if necessary; guest Wi-Fi can prevent devices from reaching each other. `npx.cmd expo start --go --tunnel` is an alternative when LAN access is unavailable, but it requires Expo's ngrok support and Internet access. Follow the CLI's installation prompt for that dependency.

## Music sources

| Source | Search | Playback in DashyMusic |
| --- | --- | --- |
| Audius | Real, keyless catalog search and trending discovery | Full streams that the provider marks publicly streamable |
| Your audio files | Import through the device file picker | Local playback; files are copied into app storage on iPhone |
| YouTube | Paste links without a key; metadata search with an optional Data API key | Official visible video player; captions when available |
| Spotify / SoundCloud | Opens the service's official search page | External service playback; no in-app stream integration |

Audius features independent artists. It does not provide Spotify's catalog, and a familiar song may not be available. Availability, network access, and source quality depend on the provider. The app filters unavailable/gated Audius entries; that does not guarantee every returned stream will remain playable.

The app does not extract YouTube audio, bypass DRM, or download streaming tracks for offline use. Your own imported files can play locally. Browser imports use temporary file URLs and must be reimported in a new browser session; iPhone imports are retained in the app's documents directory until you remove the app or its data. Imported titles initially come from filenames; embedded tag/cover extraction is not implemented, so imported tracks may use the app's artwork fallback.

## Player, library, and AutoMix

- Purple/cyan translucent panels, animated artwork backgrounds, and real track covers with decorative fallback art.
- Favorites, recently played tracks, and personal playlists saved on this device. The current playback queue lasts for the session.
- Crossfade from 0–12 seconds, using equal-power or linear curves. Short tracks limit the overlap to available duration.
- Intro and outro fades from 0–3 seconds, repeat off/all/one, and 15/30/60-minute sleep choices.
- **Audition transition** jumps near the end of the current song when a next audio song is queued.
- Song and playlist sharing sends links or descriptions. It does not create a synchronized listening room or copy another device's local music files.

AutoMix blends adjacent Audius streams or imported audio. It does not perform AI analysis, beat detection, BPM matching, harmonic mixing, source separation, or guaranteed gapless playback. It cannot prevent a network stall. There is no artificial FLAC/lossless quality selector: playback uses the available source.

The installed iOS build uses the local [DashyAudio module](modules/dashy-audio/README.md): two native `AVPlayer` decks, native fade scheduling, native queue advancement, `MPNowPlayingInfoCenter`, remote commands, and `AVRoutePickerView`. In Expo Go, a separate `expo-audio` player provides real audio and a JavaScript-driven preview of the queue/fades. Browser playback uses its own web transport. These preview transports do not establish native screen-off behavior.

Collapsing the audio player keeps the song playing. YouTube is separate: its video remains visible and pauses when its sheet closes or the app backgrounds. Force-quitting the app, lost connectivity, interruptions, or system restrictions can stop audio even in a native build.

## Lyrics and captions

Audius songs automatically look for synchronized lyrics on [LRCLIB](https://lrclib.net/) using an exact artist/title match and a matching recording duration. Matching lyrics highlight and scroll with playback, with a source link. Provider lyrics are kept only in a bounded session cache; songs without a matching timed version stay available for manual imports. Lyrics availability and third-party rights are separate from permission to use the API; review display/distribution rights before releasing a public music service.

Open a song's lyrics panel and choose **Add .lrc**. Import a `.lrc` or `.txt` file containing timed lyrics you have permission to use. Lines highlight and scroll with playback; tap a line to seek. Files are associated with the selected track and saved locally.

This original format example is not the lyrics of a catalog song:

```text
[ar:Original demonstration]
[ti:A little light]
[00:00.00]A little light across the room
[00:05.00]A rhythm only we can hear
[00:10.00]Let every color find its tune
[00:15.00]And keep the moment close and clear
```

Multiple timestamps and `[offset:+500]` metadata are supported; offsets are milliseconds. The importer accepts files up to 1 MB with valid timed lines.

YouTube captions are requested inside the official video player when available. Its public API cannot supply arbitrary creators' caption text for the separate singing panel. Automatic lyric discovery is not assumed merely because a video has captions.

## Optional YouTube search key

Audius and local playback need no API key. For YouTube metadata search:

1. Select or create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **YouTube Data API v3** and create an API key.
3. Restrict the key to that API and apply suitable application restrictions for your deployment.
4. Save it in DashyMusic's settings, or copy `.env.example` to `.env.local`, set `EXPO_PUBLIC_YOUTUBE_API_KEY`, and restart Expo.

The API offers a free quota, not unlimited search. Check the project's current quota and terms in Google Cloud. The app sends search requests to Google and does not download media. A locally saved key uses device storage, not an encrypted secret vault; client-side API keys and all `EXPO_PUBLIC_*` values are accessible to the client. Do not commit private credentials or paste them in chat.

YouTube embedding can fail because of a video's restrictions, network access, or player identification. The native player uses the app bundle identifier as its client identity. For a deployment requiring a real hosted origin, `EXPO_PUBLIC_PLAYER_ORIGIN` can supply an HTTPS application origin you control. Error 153 requires checking identification on the device; do not invent a website or disable browser security.

## Development commands

Use Node.js 24; dependency versions are locked in `package-lock.json`. EAS CLI 25.3 is included as a development dependency.

| Command | Purpose |
| --- | --- |
| `npm.cmd ci` | Install the locked dependencies |
| `npm.cmd run iphone` | LAN development server for Expo Go |
| `npm.cmd run iphone:dev` | LAN server for an installed custom development client |
| `npm.cmd run web` | Browser development build |
| `npm.cmd run check` | TypeScript checks and unit tests |
| `npm.cmd run test:e2e` | Browser integration tests |
| `npm.cmd run export:web` | Production web bundle in `dist` |
| `npm.cmd run export:ios` | iOS JavaScript/Hermes export; does not compile or sign Swift |
| `npm.cmd run build:ios:dev` | EAS internal iPhone development build; requires project setup and Apple signing |
| `npm.cmd run build:ios` | EAS internal iPhone preview build with its bundle included |

For browser tests, run `npm.cmd run web -- --port 8081` in one terminal, then `npx.cmd playwright install chromium` and `npm.cmd run test:e2e` in another. `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_CHROMIUM_PATH` can override the test server and browser executable. `npm.cmd run ios` requires a Mac with Xcode; Windows cannot run the iOS Simulator.

See [validation evidence](docs/VALIDATION.md) for completed checks and their limits. Provider HTTP responses, TypeScript, mocked browser tests, and JavaScript exports do not establish that Swift compiles or native background playback works. The Linux development workspace has no Xcode or attached iPhone, but the [unsigned macOS simulator compile](https://github.com/fizzberwyndash/DashyMusic/actions/runs/40091221025) passed, including native module compilation. No signed physical-device build or screen-off playback test has been performed. Follow the physical-device checklist in [iOS build instructions](docs/IOS-BUILD.md) before relying on native background AutoMix.

## References

- [Audius API](https://docs.audius.co/)
- [LRCLIB API](https://lrclib.net/docs)
- [LRCLIB API terms](https://lrclib.net/developers/terms)
- [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/)
- [Apple membership comparison](https://developer.apple.com/support/compare-memberships/)
- [YouTube API getting started](https://developers.google.com/youtube/v3/getting-started)
- [YouTube quota costs](https://developers.google.com/youtube/v3/determine_quota_cost)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube caption permissions](https://developers.google.com/youtube/v3/docs/captions/download)
- [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies)
