package de.ithandwerk.foldpage;

import android.content.ActivityNotFoundException;
import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens the system screens the app can ask for but not replace.
 *
 * <p>Reading aloud is done by whatever speech engine the phone has been set to
 * use — FoldPage only asks. When that engine is missing, disabled, or set to a
 * language it has no voice for, the app stays silent and there is nothing it
 * can fix from the inside. What it can do is take the reader straight to the
 * screen where the choice is made, instead of describing a path through
 * Settings that differs on every manufacturer's phone.
 */
@CapacitorPlugin(name = "SystemSettings")
public class SystemSettingsPlugin extends Plugin {

    /** Android's text-to-speech output screen: engine, speed, language, and the
     *  "Listen to an example" button that settles whether the fault is here or
     *  in the app. */
    @PluginMethod
    public void openTextToSpeech(PluginCall call) {
        // The public constant only exists from API 30; the action string itself
        // has been the same since Android 4 and works on every device that has
        // the screen at all.
        Intent intent = new Intent("com.android.settings.TTS_SETTINGS");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException notFound) {
            // Some manufacturers bury or remove it. Fall back to accessibility
            // settings, which lead there on every build that has it.
            try {
                Intent fallback = new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (ActivityNotFoundException stillNotFound) {
                call.reject("This phone has no text-to-speech settings screen");
            }
        }
    }
}
