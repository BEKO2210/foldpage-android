# Third-party notices

FoldPage for Android ships and builds on the open source components below. Each
is governed by its own license, which is unaffected by the license of FoldPage
itself. Full license texts live in each package's folder under `node_modules/`
after `npm install`, and in the upstream repositories linked here.

## Bundled into the APK

| Component                | Version | License    | Project                                         |
| ------------------------ | ------- | ---------- | ----------------------------------------------- |
| Next.js                  | 16.2.10 | MIT        | https://github.com/vercel/next.js               |
| React                    | 19.2.4  | MIT        | https://github.com/facebook/react               |
| React DOM                | 19.2.4  | MIT        | https://github.com/facebook/react               |
| @mozilla/readability     | 0.6.0   | Apache-2.0 | https://github.com/mozilla/readability          |
| idb                      | 8.0.3   | ISC        | https://github.com/jakearchibald/idb            |
| @capacitor/core          | 8.5.0   | MIT        | https://github.com/ionic-team/capacitor         |
| @capacitor/android       | 8.5.0   | MIT        | https://github.com/ionic-team/capacitor         |
| @capacitor/app           | 8.1.1   | MIT        | https://github.com/ionic-team/capacitor-plugins |
| @capacitor/browser       | 8.0.4   | MIT        | https://github.com/ionic-team/capacitor-plugins |
| @capacitor/filesystem    | 8.1.2   | MIT        | https://github.com/ionic-team/capacitor-plugins |
| @capacitor/haptics       | 8.0.2   | MIT        | https://github.com/ionic-team/capacitor-plugins |
| @capacitor/share         | 8.0.1   | MIT        | https://github.com/ionic-team/capacitor-plugins |
| @capacitor/splash-screen | 8.0.2   | MIT        | https://github.com/ionic-team/capacitor-plugins |
| @capacitor/status-bar    | 8.0.3   | MIT        | https://github.com/ionic-team/capacitor-plugins |

Capacitor pulls in AndroidX libraries (Apache-2.0) at build time; those ship
inside the APK as well.

## Build-time only

| Component                                            | Version            | License          |
| ---------------------------------------------------- | ------------------ | ---------------- |
| Tailwind CSS                                         | 4.3.3              | MIT              |
| TypeScript, ESLint, Capacitor CLI, @capacitor/assets | see `package.json` | MIT / Apache-2.0 |

## Apache-2.0 attribution

**Readability** — Copyright Mozilla Foundation, licensed under the Apache
License, Version 2.0. Obtain a copy at
http://www.apache.org/licenses/LICENSE-2.0. The library is used unmodified for
extracting the readable body of a web page.

## MIT notice

The MIT-licensed components above are provided under the MIT License, which
requires that their copyright notice and permission notice be preserved. They
are reproduced verbatim inside the respective packages, and this file serves as
the collected notice for the built APK.
