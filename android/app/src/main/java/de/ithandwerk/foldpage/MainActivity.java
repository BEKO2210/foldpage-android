package de.ithandwerk.foldpage;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before super.onCreate so the plugin's load() sees the
        // launch intent — a share that cold-starts the app must not be lost.
        registerPlugin(ShareTargetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
