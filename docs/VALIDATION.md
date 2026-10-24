# DashyMusic 0.2 validation — 2026-10-24

Validated in the Linux cloud workspace with Node.js 24 and the locked Expo SDK 58 dependencies.

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Domain, data, lyrics, player and queue unit tests | 50 passed, none skipped |
| Browser feature checks | 42 passed across desktop, iPhone 14 and iPhone SE Chromium layouts |
| Saved-library read-failure checks | 3 passed; unreadable existing data is preserved while session playback/favorites remain usable |
| Web production export | Passed |
| iOS JavaScript/Hermes export | Passed; does not compile Swift or sign an app |
| iOS project generation | Passed; generated Info.plist contains audio background mode and no microphone permission |
| Local native module discovery | Passed; Expo autolinking resolves DashyAudioModule and its CocoaPods specification |
| Swift grammar parsing | Four Swift files passed tree-sitter-swift parsing; not a compiler or Apple SDK check |
| Unsigned macOS simulator compilation | Workflow prepared; result pending |

Browser checks exercise the real application and local persistence with simulated catalog/lyrics responses and media transports. They cover keyless Audius search, errors and recovery, favorites, playlists, local imports, player collapse, queue/transport actions, crossfade controls, keyboard range inputs, repeat, sleep settings, lyric imports, exact LRCLIB matching/attribution, and visible YouTube player lifecycle. Mocked screenshots in [screenshots](screenshots/) demonstrate the interface, not a physical-device capture or a claim of mainstream catalog availability.

## Live music evidence

Official Audius search and trending requests each returned 30 publicly streamable tracks without an API key. A direct official stream request followed HTTPS redirects and returned a valid MP3 byte-range response.

The unchanged web audio engine was also exercised with genuine Chromium Audio decoding and official Audius stream bytes through a **test-only TLS-verified Node relay**. Both tracks decoded and advanced playback time. Manual skip and a range seek worked. A six-second equal-power crossfade played both decks concurrently (observed gains about 0.821 and 0.570), then released the outgoing deck and left the incoming deck at full gain. Pause stopped playback cleanly. This relay is not included in the app.

The relay was needed because direct outbound Chromium connections in this cloud workspace reject the environment proxy certificate. TLS verification remained enabled throughout. These results validate real web audio delivery and the queue/crossfade transport; they do not establish direct device networking or native iPhone playback.

LRCLIB's official anonymous lookup endpoint was checked live without printing or committing returned lyric text. Automatic results require an exact artist/title and a matching recording duration; tests use original demonstration text. Provider lyrics remain in a bounded session cache, while user-imported LRC files are saved with the library.

## Native and provider limits

The Swift source has independent source review and grammar validation. The Linux workspace has no Xcode or Apple SDK. The macOS CI workflow builds an unsigned simulator target without Apple signing credentials; its result must be checked separately. A successful simulator compilation would still not prove lock-screen playback, AirPlay behavior, interruptions, or physical-device fade quality.

No signed iOS app, physical-iPhone background test, Apple Developer enrollment, TestFlight release, App Store submission, or personal-PC access has been performed. Follow [the iPhone build guide](IOS-BUILD.md) for the supported installed-app path. With Windows and no paid Apple Developer membership, Expo Go remains the immediate preview route; free personal signing requires a separate Mac/Xcode workflow.

YouTube remains visible video and is excluded from background audio/crossfades. Live YouTube metadata search was not tested with a real key. Spotify and SoundCloud search controls open their official services; they are not in-app raw-audio integrations. Imported files initially use filenames for titles and fallback artwork; embedded-tag extraction is not implemented.

Configuration draft saves are separate from publication. No draft save alone establishes a new cloud snapshot or fresh-task restoration.
