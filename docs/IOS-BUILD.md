# iPhone setup and native builds

There are two ways to run DashyMusic on an iPhone. Expo Go is the free starting point for this Windows setup. An installed custom build is needed to include the project's Swift audio engine.

## Without a paid Apple Developer membership

Use **Expo Go** with a free Expo account. It supports the redesigned interface, real Audius streams, local imports, playlists, and a foreground preview of transitions. It cannot load the local `DashyAudio` Swift module or prove reliable background queue/crossfade behavior. Rebuilding JavaScript or reloading Expo Go cannot add a native module to it.

From the updated project folder in Windows PowerShell:

```powershell
npm.cmd ci
npx.cmd expo login --no-browser --username andredash
npx.cmd expo whoami
npm.cmd run iphone
```

Replace the username if appropriate. Enter the password at the private prompt, not as a command argument. Expo CLI has no `--force` option for login. To switch accounts, use `npx.cmd expo logout`, then log in again. If browser authentication previously stalled, `--no-browser` explicitly chooses the terminal login path.

On the iPhone, install an Expo Go release supporting SDK 58, log in to the same Expo account reported by `expo whoami`, and scan the QR code with Camera. Both devices should be on the same Wi-Fi. Press `s` in Expo's terminal if necessary to select the Expo Go target instead of a development client. Allow Node.js on Windows Firewall's private-network profile if it is blocking LAN access.

A free Apple ID can sign a personal device build through **Xcode on a Mac** using a Personal Team, subject to Apple's capabilities and short-lived provisioning, typically requiring a rebuild/reinstall after seven days. This is not an EAS ad hoc distribution route, and Xcode is not available on Windows. A simulator build also requires a Mac to run and cannot be installed on an iPhone.

The existing Windows/free-account route therefore remains Expo Go until you have either the required paid Apple membership for the EAS device builds below or access to a Mac for a separate Personal Team workflow.

## EAS builds for a physical iPhone

The repository includes EAS profiles and the native module's source. It does **not** include signing credentials or an invented EAS project ID. EAS internal iOS distribution uses registered devices and Apple ad hoc provisioning, which requires a paid Apple Developer Program membership with suitable permissions. An Expo account or an EAS service plan does not replace that Apple membership.

Check [Expo's internal distribution guide](https://docs.expo.dev/build/internal-distribution/) and [Apple's membership comparison](https://developer.apple.com/support/compare-memberships/) before choosing this route. Do not run these steps expecting an Apple free account to produce an installable ad hoc build.

### Link the actual Expo project

The local dependencies include EAS CLI 25.3. In the project folder:

```powershell
npx.cmd eas login --no-browser
npx.cmd eas whoami
npx.cmd eas init
```

Use the account that has access to the intended Expo project. If your existing project is named **AndreDash** under your team, link that actual project rather than creating a duplicate. Check its owner, slug, and project ID in Expo's dashboard. You need a project role that permits linking and building.

If the automatic flow offers to create a new project while you intend to use the existing one, cancel and link using that project's real ID from its settings:

```powershell
npx.cmd eas init --id YOUR_EXISTING_PROJECT_ID
```

`YOUR_EXISTING_PROJECT_ID` is a placeholder to replace, not a value to paste literally. Let the CLI reconcile the project's configuration and inspect the resulting changes. Do not insert a guessed UUID or overwrite another project's settings. No EAS project ID can be inferred just from a display name.

### Register the iPhone and create a development build

With the paid Apple membership and correct Expo project access available:

```powershell
npx.cmd eas device:create
npm.cmd run build:ios:dev
```

Open the device-registration link on your physical iPhone and follow the provisioning instructions. During the build, follow EAS's Apple authentication and signing prompts privately. Never send passwords, verification codes, certificates, or tokens in chat.

The `development` profile enables a custom development client with internal distribution and `simulator: false`. Select the registered iPhone when preparing its ad hoc provisioning profile. New devices need to be included in a new or updated profile; a previously built app does not automatically become installable on every iPhone.

Once EAS finishes successfully, install the resulting build through its provided installation page on the registered iPhone. This is **DashyMusic's development app**, not Expo Go. Start its Metro server on Windows:

```powershell
npm.cmd run iphone:dev
```

Open the installed development app and scan the new development-client QR code. Keep the server running and use the same LAN. If the app still says **PREVIEW PLAYER** instead of **NATIVE AUDIO**, confirm you opened the custom build and that its native module was linked. Rebuilding is required after native module or native configuration changes.

### Preview build without Metro

For an app containing its JavaScript bundle:

```powershell
npm.cmd run build:ios
```

This uses the `preview` profile with internal distribution and a physical-device target. It has the same Apple membership, signing, and registered-device requirements. Install only after the build succeeds. Metro need not stay running, but Audius streaming still needs an Internet connection. Imported local files do not require a network connection to play.

The `production` and `simulator` profiles are available for later workflows. They do not remove the signing requirements for real devices. App Store submission, TestFlight, a completed signed build, and publication are not claimed by the presence of `eas.json`.

## What the custom build adds

`modules/dashy-audio` is a local Expo module for iOS 16.4 or newer. It implements two native `AVPlayer` decks, native equal-power/linear fade scheduling, queue advancement, repeat modes, a sleep timer, `MPNowPlayingInfoCenter` metadata, remote playback commands, and an `AVRoutePickerView` AirPlay control. The installed app needs the configured audio background mode and module autolinking.

Those operations are designed to run without React Native JavaScript timers driving each transition. That design still needs native compilation and physical-device validation. The app cannot guarantee uninterrupted audio through force-quit, system interruptions, network loss, or provider restrictions. AutoMix does not perform beat detection or AI song analysis.

Only Audius streams permitted by the provider and imported audio use this engine. YouTube remains a visible foreground video player and is excluded from the native audio queue. Spotify and SoundCloud options open their actual services and do not supply extracted streams.

## Physical-device checks before relying on it

No Mac/Xcode compile, signed iOS build, or physical-iPhone audio test was available in the Linux development workspace. A successful JavaScript export or browser test does not compile Swift. After a native build succeeds:

1. Confirm the player reports **NATIVE AUDIO**. Play one Audius song and one imported audio file; test play/pause, seeking, and skip.
2. Queue at least three playable tracks. Set a six-second crossfade, lock the phone, and listen through multiple automatic transitions. Repeat with local files to distinguish engine behavior from network stalls.
3. Test equal-power and linear curves, crossfade off, intro/outro fades, and pause/seek/skip while two songs overlap.
4. Test repeat off/all/one and sleep expiry in the foreground and with the device locked. Repeat off should end the queue cleanly.
5. Check lock-screen and Control Center title, artist, artwork, progress, and remote controls.
6. Test cellular streaming, headphones, Bluetooth/AirPlay output, unplugging headphones, and an audio interruption. Avoid promising transitions when the next track has not loaded.
7. Save favorites and playlists, import permitted timed lyrics, restart the app, and confirm local persistence. Confirm imported lyric highlighting and tap-to-seek.
8. Open a YouTube video and verify captions where available. Close its sheet or switch apps; its video should pause while the separate audio engine remains governed by the app's playback controls.
9. Review load failures and memory/resources after repeatedly opening the player and changing queues. Confirm old queues and duplicate remote actions do not remain active.

See [validation evidence](VALIDATION.md) for cloud checks, and the [native module notes](../modules/dashy-audio/README.md) for its contract and limits.
