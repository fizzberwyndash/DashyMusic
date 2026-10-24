# Validation — 2026-10-23

Validated in the Linux cloud workspace with Node.js 24.19.0 and npm 11.9.0.

| Check | Result |
| --- | --- |
| Frozen dependency install (`npm ci`) | Passed, 500 packages installed |
| TypeScript (`npm run typecheck`) | Passed |
| Domain and player lifecycle tests (`npm test`) | 19 passed, none skipped |
| Browser integration (`npm run test:e2e`) | 12 passed, none skipped |
| Production web export | Passed |
| iOS JavaScript/Hermes export | Passed; not an Xcode compile or signed application |
| Expo web development server | Rendered home and navigated to Library with no uncaught app errors |

Browser checks ran in Chromium at desktop, iPhone 14, and iPhone SE sizes. YouTube's player API, iframe document, metadata search, and artwork were simulated in these tests. They exercised real application navigation, local persistence, key entry/removal, link selection, visible player dimensions, player teardown, lyric file import, timed highlighting, and tap-to-seek. They do not establish real video availability, caption availability, or media playback. Player lifecycle unit tests ran the generated native HTML JavaScript with a fake clock; they did not run WKWebView.

Live YouTube and artwork requests returned cloud proxy HTTP 403. No live search key was supplied, and no real search operation was claimed. Native iPhone, Safari, cellular streaming, App Store signing, and distribution remain unverified. The README contains the physical-device checklist.

Reusable cloud `install_script` and `start_skill` instructions were saved in the environment draft, together with domain additions for `www.youtube.com`, `youtube.com`, `www.youtube-nocookie.com`, `i.ytimg.com`, `s.ytimg.com`, `www.googleapis.com`, `*.googlevideo.com`, and `developers.google.com`. The package-manager preset was preserved. Saving did not apply those network changes or publish the environment. Review and save the changes in environment settings, then publish to capture the prepared environment. Fresh-task restoration has not been tested.

Source files were created in the existing DashyMusic checkout. No GitHub push, personal PC access, iPhone installation, or publication was performed.
