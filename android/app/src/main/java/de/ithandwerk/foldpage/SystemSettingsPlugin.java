package de.ithandwerk.foldpage;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.view.View;

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

    private AudioFocusRequest focusRequest;

    /**
     * Claims audio focus for speech, and keeps it until speaking is done.
     *
     * <p>Android 16 hardened background playback: audio started by another
     * process on an app's behalf is muted unless somebody holds focus. The
     * speech engine is a separate process, so on this phone it synthesised the
     * article, opened an AudioTrack, and the system muted it — the log said
     * "AudioHardening background playback would be muted for
     * com.google.android.tts" while the app itself reported success. Nothing in
     * the app could see that, which is why it looked like nothing happened at
     * all.
     *
     * <p>Requested as MEDIA/SPEECH, transient with duck: a navigation prompt or
     * an incoming call lowers or stops the article rather than talking over it.
     */
    @PluginMethod
    public void requestAudioFocus(PluginCall call) {
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audio == null) {
            call.reject("No audio service on this device");
            return;
        }
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attributes)
                    .setWillPauseWhenDucked(false)
                    .build();
            result = audio.requestAudioFocus(focusRequest);
        } else {
            result = audio.requestAudioFocus(
                    null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
        com.getcapacitor.JSObject answer = new com.getcapacitor.JSObject();
        answer.put("granted", result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
        call.resolve(answer);
    }

    /**
     * The pulse a gesture gives when it crosses the point of no return.
     *
     * <p>Android has a constant for exactly this — the same feedback the system
     * uses when a swipe-to-dismiss will actually dismiss — and it is tuned per
     * device rather than being a duration somebody guessed. The web API can
     * only vibrate for N milliseconds, which feels like a phone buzzing rather
     * than like an interface answering.
     */
    @PluginMethod
    public void gestureThreshold(PluginCall call) {
        View view = getBridge().getWebView();
        if (view == null) {
            call.resolve();
            return;
        }
        int effect = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? HapticFeedbackConstants.GESTURE_START
                : HapticFeedbackConstants.VIRTUAL_KEY;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            effect = HapticFeedbackConstants.GESTURE_THRESHOLD_ACTIVATE;
        }
        view.performHapticFeedback(effect, HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING);
        call.resolve();
    }

    /** Hands focus back, so music or a podcast can resume. */
    @PluginMethod
    public void abandonAudioFocus(PluginCall call) {
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audio != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                audio.abandonAudioFocusRequest(focusRequest);
                focusRequest = null;
            } else {
                audio.abandonAudioFocus(null);
            }
        }
        call.resolve();
    }

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
