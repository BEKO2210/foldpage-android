<div align="center">

<img src="docs/screenshots/icon.png" alt="" width="112" height="112">

# FoldPage for Android

**Save an article. Read it clean, offline, whenever.**

A read-it-later app that keeps everything on your phone — no account, no cloud,
no tracking.

[![Coming soon on Google Play](https://img.shields.io/badge/Google%20Play-coming%20soon-1B1F2A?style=for-the-badge&logo=googleplay&logoColor=F4D44D)](https://play.google.com/store/apps/details?id=de.ithandwerk.foldpage)
[![Signed APK](https://img.shields.io/badge/APK-signed-F4D44D?style=for-the-badge&logo=android&logoColor=1B1F2A)](#verifying-the-download)
[![Latest release](https://img.shields.io/github/v/release/BEKO2210/foldpage-android?style=for-the-badge&label=latest&color=1B1F2A)](https://github.com/BEKO2210/foldpage-android/releases/latest)

<br>

<img src="docs/screenshots/welcome-light.png" alt="The first-launch welcome: the folded page mark, a headline and three lines explaining the app" width="30%">
<img src="docs/screenshots/library-light.png" alt="The library in the light theme: saved articles as cards with site, reading time and tags" width="30%">
<img src="docs/screenshots/library-dark.png" alt="The same library in the dark theme" width="30%">

<sub>First launch, the library, and the same library in dark — the theme follows the system.</sub>

</div>

---

## What it does

You send a link to FoldPage. The app fetches the page, strips the ads, banners,
newsletter pop-ups and cookie walls, and keeps the article — text and images —
in local storage. From then on it reads offline, in a typography built for long
text rather than for engagement.

- **Share to save** — hit _Share_ in any app, pick FoldPage, done. The link is
  fetched and filed away in the background.
- **A real reader** — serif body text, four text sizes, light and dark following
  your system theme.
- **Picks up where you stopped** — scroll position is remembered per article and
  a progress bar shows how far in you are.
- **Inbox, Archive, Favorites** — plus free-form tags and full-text search
  across everything, including the article bodies.
- **Deleting is undoable** — a toast with _Undo_, not a modal asking twice.
- **Import and export** — bring a Pocket export (CSV or HTML) or any bookmarks
  file; export to JSON, HTML or Markdown at any time.
- **Offline by construction** — after saving, nothing needs a network. The
  entire app ships inside the APK.
- **Says what it is** — a one-time welcome on first launch explains how a link
  gets in, what comes back, and where it stays.
- **Stays where you left it** — switching sections keeps each one's scroll
  position, and the hardware back button walks back through them instead of
  dropping you out of the app.

## What it looks like

|                                                                                                                        |                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="docs/screenshots/reader-dark.png" alt="The reader in the dark theme" width="240">                            | **The reader** — serif body text at one of four sizes, a hairline progress bar at the top, and a toolbar that stays out of the way. Everything the page carried around the article is gone. |
| <img src="docs/screenshots/settings-dark.png" alt="The settings screen: library stats, import and export" width="240"> | **Settings** — what your library holds, import from Pocket or a bookmarks file, export to JSON, HTML or Markdown. No account to manage, because there isn't one.                            |

## Privacy

There is no account, no analytics, no crash reporting, no ad SDK. The app makes
exactly one kind of outbound request: fetching a page you asked it to save.
Your library lives in the app's private storage on the device and is never
uploaded anywhere. Permissions requested: `INTERNET` and `VIBRATE` — that's the
complete list.

The full wording lives on the project page:
[Datenschutz](https://beko2210.github.io/foldpage-android/datenschutz/) ·
[Impressum](https://beko2210.github.io/foldpage-android/impressum/) — both are
also linked from the app's settings screen.

## Install

1. Grab `foldpage-<version>.apk` from the
   [Releases](https://github.com/BEKO2210/foldpage-android/releases) page.
2. Open it on your phone and confirm the install.

Two prompts are unavoidable when installing an app from outside the Play Store,
and they are not a sign anything is wrong:

- **"Allow installs from this source?"** — Android asks once per app that hands
  over an APK (your browser or file manager). Allow it, then install.
- **A Play Protect scan notice** — Google flags every app it has not seen
  before. Tap _Install anyway_. Verify the fingerprint below if you want
  certainty about who built the file.

Requires Android 7.0 (API 24) or newer.

### Verifying the download

```bash
apksigner verify --print-certs foldpage-<version>.apk
```

Signing certificate SHA-256:

```
84:50:48:E1:19:8E:0C:8C:2C:88:34:68:CD:14:14:46:03:13:76:4A:4A:CB:C7:CE:3A:D0:46:99:B0:A9:72:72
```

If that fingerprint does not match, the file is not the one built here.

The key changed with 1.5, which is also the upload key for Google Play. Builds
up to 1.4 carried a different certificate
(`DE:B2:4E:26:…:85:8F`), so Android refuses to update a 1.4 install in place —
uninstall it first. Nothing was published under the old key.

## How it is built

A Next.js app, statically exported and wrapped in a Capacitor WebView. There is
no server anywhere in the picture — the parts that used to run on one were moved
onto the device:

| Concern                | How it works on the phone                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Fetching a page        | `CapacitorHttp` — native, so no CORS wall and real redirects                                                  |
| Extracting the article | `@mozilla/readability` against a `DOMParser` document                                                         |
| Sanitizing             | an allowlist of tags, attributes and URL schemes, applied in an inert document before anything is stored      |
| Storage                | IndexedDB via `idb`                                                                                           |
| Sharing into the app   | a small Capacitor plugin (`ShareTargetPlugin.java`) that catches `ACTION_SEND`, on cold start as well as warm |
| Exports                | written to _Documents_, then handed to the Android share sheet                                                |

### Build it yourself

```bash
npm install
npm run build          # static export into out/
npx cap sync android
cd android && ./gradlew assembleDebug
```

`npm test` runs the unit tests — article extraction, plus the contrast and
motion constraints below. Release builds come from `./gradlew bundleRelease` and
need the signing keystore, which is not in this repository.

### Constraints that are tested, not just documented

Two things that are easy to break silently are pinned by tests rather than
prose, so a regression fails the run instead of shipping:

- [`docs/CONTRAST.md`](docs/CONTRAST.md) — every text role in both themes,
  enforced by `lib/contrast.test.ts` at WCAG AA (4.5:1 for body text).
- [`docs/MOTION.md`](docs/MOTION.md) — every animation with its duration and
  fill mode, enforced by `lib/motion.test.ts`. Page wrappers use `backwards`
  fill on purpose: a lingering `transform` turns an element into the containing
  block for its `position: fixed` children, which is exactly how the bottom
  navigation once ended up floating in the middle of the screen.

## Project layout

```
app/            routes: library, reader (/read/?id=), settings
components/     UI — Library, AppNav (persistent bottom bar), TopBar,
                TagEditor, icons
lib/            db (IndexedDB), parse (extraction), native (Capacitor bridge),
                importExport, tests
android/        the Capacitor Android project incl. the share-target plugin
docs/           architecture map and roadmap, release runbook, contrast and
                motion audits, screenshots, and the legal pages published via
                GitHub Pages
scripts/        icon/splash generation and the signed release build
```

## Status

Version 1.5 — the local-only MVP after a full UI/UX pass and two rounds of
fixes that only showed up on a real device, now in closed testing on Google
Play. Sync between devices exists in the web version of FoldPage and is
deliberately absent here. Where the work goes next is written down in
[`docs/ROADMAP.md`](docs/ROADMAP.md); how the app is put together, in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

The reader is measured against a frozen corpus of 39 real articles from 22
sites — `npm run corpus` for extraction, `npm run reader-render` for the
rendered page, both offline and deterministic. Current: 78 renders, 42 table
checks, no failures. What the corpus cannot see is written down in
[`docs/READER-LAB.md`](docs/READER-LAB.md) rather than left implied.

Verified on a 412×915 viewport: no interactive element under 44 px, no
horizontal overflow, every text role above 4.5:1 in both themes, and the bottom
bar holds its position across a route change. Confirmed on a device: install, saving,
reading, and that no system scrim sits above the app any more. Still
unconfirmed there: the share intent and the adaptive icon.

## License

Free to use, not free to modify or redistribute. See [LICENSE.md](LICENSE.md).
The open source libraries this app builds on keep their own licenses — see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
