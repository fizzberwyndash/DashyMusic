# DashyAudio native iOS engine

This local Expo module supplies the installed iOS build's audio transport. It is intentionally absent from Expo Go; the application facade provides a separate preview player there.

## Responsibilities

- Two native `AVPlayer` decks, with the next queue item prepared ahead of time.
- Equal-power or linear crossfades, bounded to 0–12 seconds and half the available track duration.
- Track-relative fade-in and fade-out controls. Crossfade envelopes replace individual intro/outro envelopes while two tracks overlap.
- Native queue advancement, repeat modes, and a sleep timer with a short fade-out.
- Audio session category `playback`, remote transport commands, Now Playing title/artist/artwork/time, and a real `AVRoutePickerView` output picker.
- Pause on headphone disconnection, and controlled resumption after audio interruptions.
- File URLs and HTTPS streams only. It does not resolve or extract audio from YouTube, Spotify, or SoundCloud.

Gain scheduling runs on a native dispatch timer, and queue progression uses native AVPlayer notifications. These operations do not depend on React Native JavaScript timers staying active when the screen locks. The application must configure the iOS `audio` background mode, and the module must be included in an installed development or standalone build. User force-quit, device shutdown, connectivity loss, provider restrictions, and system interruptions can stop playback.

The engine waits until the incoming deck actually plays before reducing the outgoing deck. It cannot remove a network stall or guarantee sample-accurate, beat-matched transitions. There is no BPM analysis, harmonic shifting, stem separation, loudness measurement, or AI transition system in this module.

## JavaScript contract

`getDashyAudioModule()` returns the optional `DashyAudio` native module. It is `null` in Expo Go and on unsupported platforms.

All transport methods return promises:

```ts
setQueue(items: AudioItem[], index: number, settings: AudioSettings): Promise<void>;
play(): Promise<void>;
pause(): Promise<void>;
seek(seconds: number): Promise<void>;
next(): Promise<void>;
previous(): Promise<void>;
setSettings(settings: AudioSettings): Promise<void>;
stop(): Promise<void>;
getState(): Promise<AudioSnapshot>;
```

`setQueue` validates and replaces the queue in a paused state; call `play` explicitly to start. `pause` retains queue and position; `stop` releases both decks and clears the queue. Methods acknowledge native command acceptance, not completion of remote stream loading. The `onState` event reports playback/loading/error changes and approximately four progress updates per second during playback.

`sleepAt` is a Unix timestamp in milliseconds or `null`; elapsed deadlines are not rearmed when settings are restored. A fade curve is either `equalPower` or `linear`; repeat is `off`, `all`, or `one`. Pause, seek, settings updates, and skip commands retain a coherent active deck during overlap. A Next command during a crossfade promotes the incoming track without replaying its introduction.

The system route picker is available through:

```ts
import { requireNativeViewManager } from 'expo-modules-core';
const AudioRoutePicker = requireNativeViewManager('DashyAudio');
// Render with an accessible touch area of at least 44 × 44 points.
```

## Build and physical-device verification

Expo autolinking must discover this folder through the application's local modules directory. Its podspec requires iOS 16.4 or newer and links ExpoModulesCore, AVFoundation, AVKit, MediaPlayer, and UIKit. The root app's configuration owns background modes and build profiles.

This module was authored in a Linux workspace with no Swift compiler, Xcode, Apple SDK, or physical iPhone attached. Native compilation and device playback have **not** been established by TypeScript or browser checks.

Before distributing a native build:

1. Run an iOS development or preview build and verify the custom module is linked rather than the Expo Go fallback.
2. Play two permitted full audio streams and two imported files. Verify the first track stays audible while the next is loading, and that failures are reported.
3. Set a six-second crossfade, lock the device, and listen through at least three automatic transitions. Repeat over cellular data and with AirPlay/Bluetooth output.
4. Pause/resume, seek, and skip during an overlap. Confirm neither a silent deck nor an old queue continues playing.
5. Confirm Now Playing title, artist, artwork, scrubber, previous/next, and play/pause controls update when the device is locked.
6. Disconnect headphones and test phone-call/system interruptions. Playback should pause on unplug and resume after an interruption only when the system permits it.
7. Test repeat off/all/one and sleep expiration while foregrounded and locked. Check the final song stops cleanly with repeat off.
8. Start and close the player repeatedly and watch for duplicate remote actions, resource retention, unexpected background playback, and crashes.
