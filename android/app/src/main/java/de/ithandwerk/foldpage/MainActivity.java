package de.ithandwerk.foldpage;

import android.os.Bundle;

import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // No EdgeToEdge.enable() here on purpose. It draws a system scrim over
        // the status-bar strip — opaque in dark, translucent in light — which
        // showed up as a foreign bar above the app. The window insets are
        // forwarded to CSS below instead, so the page still pads itself.
        // Registered before super.onCreate so the plugin's load() sees the
        // launch intent — a share that cold-starts the app must not be lost.
        registerPlugin(ShareTargetPlugin.class);
        registerPlugin(SystemSettingsPlugin.class);
        super.onCreate(savedInstanceState);
        forwardInsetsToCss();
    }

    /**
     * Hands the real window insets to CSS as custom properties.
     *
     * <p>Under edge-to-edge the WebView fills the display and the page is
     * supposed to pad itself with {@code env(safe-area-inset-*)}. On this
     * device that value arrives as zero, so the article text ran underneath
     * the status bar. The platform does know the correct inset — it just never
     * reaches CSS — so we read it here and publish it as
     * {@code --fp-inset-top} and friends, which the stylesheet prefers over
     * {@code env()}.
     */
    private void forwardInsetsToCss() {
        final WebView webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());
            float density = getResources().getDisplayMetrics().density;
            final String css = String.format(
                    java.util.Locale.US,
                    "document.documentElement.style.setProperty('--fp-inset-top','%.2fpx');"
                            + "document.documentElement.style.setProperty('--fp-inset-right','%.2fpx');"
                            + "document.documentElement.style.setProperty('--fp-inset-bottom','%.2fpx');"
                            + "document.documentElement.style.setProperty('--fp-inset-left','%.2fpx');",
                    bars.top / density,
                    bars.right / density,
                    bars.bottom / density,
                    bars.left / density);
            view.post(() -> webView.evaluateJavascript(css, null));
            return windowInsets;
        });
        // The listener only fires on a change; ask for the current state too,
        // otherwise a cold start keeps the zero values until the first rotation.
        webView.post(() -> ViewCompat.requestApplyInsets(webView));
    }
}
