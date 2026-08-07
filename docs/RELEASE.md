## Signierter Release-Build

Ein Befehl aus dem Repo-Wurzelverzeichnis:

```bash
scripts/release-build.sh              # Web-Build + cap sync + signierte APK
scripts/release-build.sh --skip-web   # nur Gradle, vorhandene Assets nutzen
```

Ergebnis: `android/app/build/outputs/apk/release/app-release.apk`, direkt danach
mit `apksigner verify --print-certs` geprueft.

### Keystore

|                    |                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Datei              | `~/.keystores/foldpage/foldpage-release.jks` (Modus 600, PKCS12)                                  |
| Alias              | `foldpage-release`                                                                                |
| Schluessel         | RSA 4096, SHA256withRSA                                                                           |
| Gueltig bis        | 2051-10-15 (9200 Tage)                                                                            |
| Zertifikat SHA-256 | `DE:B2:4E:26:50:42:55:FB:8A:FA:E9:0C:CB:B2:4D:48:DB:2D:59:8E:85:11:3B:19:8B:C3:D6:C6:13:14:85:8F` |

Der Keystore liegt bewusst **ausserhalb** des Repos. Geht er verloren, laesst sich
keine Update-APK mehr auf ein installiertes FoldPage schieben — Android akzeptiert
nur Updates mit derselben Signatur. Also mitsichern.

### Passwoerter

Infisical, Projekt `foldpage`, Environment `prod`:

- `ANDROID_KEYSTORE_PATH`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD` (bei PKCS12 identisch mit dem Store-Passwort)
- `ANDROID_KEYSTORE_SHA256`

`scripts/release-build.sh` holt sie ueber die Machine Identity aus
`~/.config/infisical/env`, schreibt sie mit `umask 077` nach
`android/keystore.properties` und loescht die Datei per `trap` am Ende des Builds —
auch wenn der Build abbricht. Die Datei ist zusaetzlich gitignored.

Ohne Infisical geht es auch: dieselben vier Werte als Umgebungsvariablen setzen und
`cd android && ./gradlew assembleRelease` aufrufen. Fehlen die Werte, faellt der
Release-Build auf "unsigniert" zurueck, statt zu scheitern.

### Minify

`minifyEnabled true` + `shrinkResources true` mit
`proguard-android-optimize.txt` und `android/app/proguard-rules.pro`.
Capacitor laedt Plugins per Reflection, deshalb halten die Regeln
`com.getcapacitor.**`, `com.capacitorjs.plugins.**`, `org.apache.cordova.**` und
alles mit `@JavascriptInterface` fest. Kommt ein Plugin dazu, das nicht unter diesen
Paketen liegt, braucht es eine eigene `-keep`-Regel — sonst faellt es erst zur
Laufzeit auf.

Das Mapping fuer lesbare Release-Stacktraces liegt nach jedem Build unter
`android/app/build/outputs/mapping/release/mapping.txt`.
