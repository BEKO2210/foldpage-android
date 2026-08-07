package de.ithandwerk.foldpage;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {
    private static String pendingValue;
    private static ShareTargetPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    static synchronized void receive(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        if (!"text/plain".equals(intent.getType())) return;

        String value = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (value == null || value.trim().isEmpty()) return;
        pendingValue = value.trim();

        if (instance != null) {
            JSObject data = new JSObject();
            data.put("value", pendingValue);
            instance.notifyListeners("shared", data);
        }
    }

    @PluginMethod
    public synchronized void consume(PluginCall call) {
        JSObject result = new JSObject();
        result.put("value", pendingValue == null ? JSObject.NULL : pendingValue);
        pendingValue = null;
        call.resolve(result);
    }
}
