package de.ithandwerk.foldpage;

import android.os.Bundle;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Explicit, so the WebView keeps getting real insets regardless of what
        // a future targetSdk bump changes about the default.
        EdgeToEdge.enable(this);
        // Registered before super.onCreate so the plugin's load() sees the
        // launch intent — a share that cold-starts the app must not be lost.
        registerPlugin(ShareTargetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
