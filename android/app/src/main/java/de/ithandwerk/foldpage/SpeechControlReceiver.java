package de.ithandwerk.foldpage;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.view.KeyEvent;

/**
 * The lock-screen buttons, on their way back into the app.
 *
 * <p>A broadcast rather than a service: the buttons only mean anything while
 * the app is alive and speaking, and a receiver keeps that fact obvious. What
 * arrives here is handed to the plugin, which passes it to the JavaScript
 * player — the same player the buttons inside the app drive, so there is one
 * place that decides what "pause" means.
 */
public class SpeechControlReceiver extends BroadcastReceiver {

    static final String PLAY = "de.ithandwerk.foldpage.PLAY";
    static final String PAUSE = "de.ithandwerk.foldpage.PAUSE";
    static final String STOP = "de.ithandwerk.foldpage.STOP";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) return;
        if (Intent.ACTION_MEDIA_BUTTON.equals(action)) {
            SpeechPlugin.dispatchTransport(fromKey(intent));
            return;
        }
        SpeechPlugin.dispatchTransport(action);
    }

    /** A headset button, a Bluetooth remote, a car stereo. The play/pause key
     *  is one key with two meanings, and only the app knows which one applies —
     *  so it is sent on as PLAY and the player decides, exactly as the button
     *  inside the app does. */
    private static String fromKey(Intent intent) {
        KeyEvent event = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
        if (event == null || event.getAction() != KeyEvent.ACTION_DOWN) return PAUSE;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_MEDIA_PLAY:
                return PLAY;
            case KeyEvent.KEYCODE_MEDIA_STOP:
                return STOP;
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                return PAUSE;
            default:
                return PLAY; // PLAY_PAUSE and friends: the player toggles
        }
    }
}
