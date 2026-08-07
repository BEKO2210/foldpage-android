<div align="center">

# FoldPage for Android

**Save an article. Read it clean, offline, whenever.**

A read-it-later app that keeps everything on your phone — no account, no cloud,
no tracking.

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

## Privacy

There is no account, no analytics, no crash reporting, no ad SDK. The app makes
exactly one kind of outbound request: fetching a page you asked it to save.
Your library lives in the app's private storage on the device and is never
uploaded anywhere. Permissions requested: `INTERNET` and `VIBRATE` — that's the
complete list.

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
DE:B2:4E:26:50:42:55:FB:8A:FA:E9:0C:CB:B2:4D:48:DB:2D:59:8E:85:11:3B:19:8B:C3:D6:C6:13:14:85:8F
```

If that fingerprint does not match, the file is not the one built here.

## How it is built

A Next.js app, statically exported and wrapped in a Capacitor WebView. There is
no server anywhere in the picture — the parts that used to run on one were moved
onto the device:

| Concern                | How it works on the phone                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Fetching a page        | `CapacitorHttp` — native, so no CORS wall and real redirects                                                  |
| Extracting the article | `@mozilla/readability` against a `DOMParser` document                                                         |
| Sanitizing             | scripts, styles, frames and event handlers stripped in an inert document before anything is stored            |
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

`npm run apk:release` produces a signed release build, but needs the signing
keystore, which is not in this repository. `npm test` runs the extraction tests.

## Project layout

```
app/            routes: library, reader (/read/?id=), settings
components/     UI — Library, TopBar, BottomNav, TagEditor, icons
lib/            db (IndexedDB), parse (extraction), native (Capacitor bridge),
                importExport
android/        the Capacitor Android project incl. the share-target plugin
scripts/        icon/splash generation and the signed release build
```

## Status

Version 1.0 — the local-only MVP. Sync between devices exists in the web version
of FoldPage and is deliberately absent here.

## License

Free to use, not free to modify or redistribute. See [LICENSE.md](LICENSE.md).
The open source libraries this app builds on keep their own licenses — see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
