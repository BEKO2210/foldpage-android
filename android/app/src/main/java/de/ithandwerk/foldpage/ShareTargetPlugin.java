package de.ithandwerk.foldpage;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Receives Android's ACTION_SEND share intent and hands the shared link to the
 * web layer.
 *
 * <p>Two paths, because the WebView is not always alive when the intent lands:
 * on a cold start the value is parked until the web layer asks for it with
 * {@code consume()}; when the app is already running the {@code shared} event
 * fires instead.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    private String pending;

    @Override
    public void load() {
        handleIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    /** Extracts the shared text, then either queues or emits it. */
    void handleIntent(Intent intent) {
        String shared = extract(intent);
        if (shared == null) {
            return;
        }
        // Neutralise the intent once it is taken. It otherwise stays attached
        // to the activity, so a process that gets killed and restored would
        // replay the same share and save the article a second time.
        if (getActivity() != null) {
            getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
        }
        if (hasListeners("shared")) {
            JSObject payload = new JSObject();
            payload.put("value", shared);
            notifyListeners("shared", payload);
        } else {
            pending = shared;
        }
    }

    /**
     * Returns the queued link once and clears it, so a later resume does not
     * re-open the same article.
     */
    @PluginMethod
    public void consume(PluginCall call) {
        JSObject result = new JSObject();
        result.put("value", pending);
        pending = null;
        call.resolve(result);
    }

    private static String extract(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return null;
        }
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null) {
            CharSequence styled = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            text = styled == null ? null : styled.toString();
        }
        if (text == null || text.trim().isEmpty()) {
            return null;
        }
        // Chrome and most readers send "Page title https://…"; keep the URL.
        for (String part : text.trim().split("\\s+")) {
            if (part.startsWith("http://") || part.startsWith("https://")) {
                return part;
            }
        }
        return text.trim();
    }
}
