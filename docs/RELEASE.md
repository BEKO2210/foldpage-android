## Signierter Release-Build

Ausgeliefert wird ab 1.5 ueber den **Play Store**. Der Build laeuft in Android
Studio (`Build > Generate Signed App Bundle / APK`) oder auf der Kommandozeile:

```bash
npm run sync
cd android && ./gradlew bundleRelease assembleRelease
```

Ergebnis: `android/app/build/outputs/bundle/release/app-release.aab` fuer die
Play Console und `android/app/build/outputs/apk/release/app-release.apk` zum
Testen. Danach pruefen:

```bash
apksigner verify --print-certs android/app/release/app-release.apk
```

`scripts/release-build.sh` ist **stillgelegt**. Es signierte mit dem alten
Keystore und holte die Passwoerter aus Infisical; beides gilt nicht mehr.
Zusaetzlich loeschte es beim Beenden `android/keystore.properties` — genau die
Datei, die der heutige Signiervorgang braucht.

### Keystore

|                    |                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Datei              | `~/Android APP KEY/FOLDPAGE.jks` (PKCS12)                                                          |
| Alias              | `key0`                                                                                            |
| Inhaber            | `C=de, ST=Baden Württenberg, L=Stuttgart, CN=Belkis Aslani`                                        |
| Schluessel         | RSA 2048, SHA256withRSA                                                                           |
| Gueltig bis        | 2051-08-05                                                                                        |
| Zertifikat SHA-256 | `84:50:48:E1:19:8E:0C:8C:2C:88:34:68:CD:14:14:46:03:13:76:4A:4A:CB:C7:CE:3A:D0:46:99:B0:A9:72:72` |
| Zertifikat SHA-1   | `F4:93:6C:64:81:8B:DE:24:83:D1:96:16:56:E3:10:7C:A9:44:0A:0F`                                     |

Dieser Schluessel ist ab **1.5** in Gebrauch und zugleich der Upload-Key fuer
Google Play. Bis einschliesslich **1.4** wurde ein anderer Keystore verwendet
(`CN=FoldPage, O=IT Handwerk`, SHA-256 `DE:B2:4E:26:…:85:8F`, RSA 4096). Ein
direktes APK-Update von 1.4 auf 1.5 lehnt Android deshalb ab — 1.4 muss vorher
deinstalliert werden. Betroffen ist niemand: 1.4 war nie oeffentlich verteilt.

Der Keystore liegt bewusst **ausserhalb** des Repos. Geht er verloren, laesst sich
keine Update-APK mehr auf ein installiertes FoldPage schieben — Android akzeptiert
nur Updates mit derselben Signatur. Also mitsichern.

### Passwoerter

Store- und Key-Passwort des Upload-Keys stehen in `android/keystore.properties`
(Modus 600, gitignored, nicht im Repo). Gradle liest sie von dort. Die Datei
gehoert zusammen mit `~/Android APP KEY/FOLDPAGE.jks` ins Backup — ohne beides
laesst sich keine Update-Version mehr fuer denselben Play-Eintrag signieren.

Die alten Infisical-Secrets (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEYSTORE_SHA256`
im Projekt `foldpage`, Env `prod`) gehoeren zum abgeloesten 4096-Bit-Keystore und
werden nicht mehr gelesen. Der Keystore bleibt aufbewahrt, damit sich alte
Builds noch verifizieren lassen.

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
