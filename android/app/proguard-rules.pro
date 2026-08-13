# FoldPage Release-Regeln fuer R8.
#
# Capacitor laedt Plugins ueber Reflection (Klassenname aus capacitor.plugins.json,
# Methoden ueber @PluginMethod). Ohne diese Keeps entfernt oder umbenennt R8 sie und
# die Bruecke WebView -> Native bricht erst zur Laufzeit.

-keepattributes *Annotation*
-keepattributes JavascriptInterface

# Capacitor-Kern und alle Plugins
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep public class * extends com.getcapacitor.Plugin
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public <methods>;
}

# Offizielle Plugins dieses Projekts (App, Browser, Filesystem, Haptics,
# Share, SplashScreen, StatusBar) liegen unter capacitorjs.
-keep class com.capacitorjs.plugins.** { *; }

# Cordova-Bruecke, die Capacitor mitbringt
-keep class org.apache.cordova.** { *; }

# Die Sprach-Engine (sherpa-onnx). Ihr C++-Teil liest die Felder der
# Konfigurationsklassen ueber JNI per Namen: GetFieldID("model", ...),
# GetFieldID("vits", ...) und so weiter. R8 hat sie im Release auf `a`, `b`, `ps`
# umbenannt — dann liefert GetFieldID null und die App bricht beim ersten
# Vorlesen mit einem nativen Absturz ab:
#   JNI DETECTED ERROR IN APPLICATION: fid == null
#   in call to GetObjectField
#   from long com.k2fsa.sherpa.onnx.OfflineTts.newFromFile(...)
# Namen und Typen dieser Klassen sind also Teil der Schnittstelle und bleiben.
-keep class com.k2fsa.sherpa.onnx.** { *; }

# Native Methoden werden vom .so-Teil ueber ihren Namen gefunden.
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}

# Alles, was der WebView per JavaScript aufruft
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Klassen, die per Reflection ueber JSON-Namen aufgeloest werden
-keepclassmembers class * {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
}

# Stacktraces aus Release-Crashes bleiben lesbar (Mapping liegt in
# app/build/outputs/mapping/release/mapping.txt).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
