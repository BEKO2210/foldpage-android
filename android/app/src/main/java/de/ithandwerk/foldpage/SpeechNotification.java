package de.ithandwerk.foldpage;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;

import androidx.core.app.NotificationCompat;

/**
 * The lock screen, and the pair of controls on it.
 *
 * <p>Reading an article out loud is playback, and Android has one idea of what
 * playback is: a {@link MediaSession} with a state, and a notification that
 * carries it. Without them the voice exists only inside the app — the screen
 * locks, the article keeps talking, and there is no way to stop it without
 * unlocking, finding the app and finding the button. With them the pause sits
 * where every other pause on the phone sits.
 *
 * <p>Deliberately no foreground service: FoldPage speaks while it is open, and
 * a service that outlives the app would be a promise this app does not make —
 * it would also need its own notification permission dance and its own reasons
 * for staying alive. What this is, is the session and the notification for as
 * long as there is something to control.
 */
final class SpeechNotification {

    static final String CHANNEL_ID = "foldpage-reading";
    static final int NOTIFICATION_ID = 4711;

    private SpeechNotification() {
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Reading aloud",
                // Low: this is a transport control, not news. It must not make
                // a sound of its own over the voice it is controlling.
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Controls for the article being read out");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    /** The notification that shows on the lock screen while an article speaks. */
    static Notification build(
            Context context,
            MediaSessionCompat session,
            String title,
            boolean playing) {
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent tap = open == null
                ? null
                : PendingIntent.getActivity(
                        context, 0, open,
                        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
                .setContentTitle(title == null || title.isEmpty() ? "Reading aloud" : title)
                .setContentText("FoldPage")
                .setContentIntent(tap)
                .setOnlyAlertOnce(true)
                .setOngoing(playing)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .addAction(
                        playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        playing ? "Pause" : "Play",
                        action(context, playing ? SpeechControlReceiver.PAUSE : SpeechControlReceiver.PLAY))
                .addAction(
                        android.R.drawable.ic_menu_close_clear_cancel,
                        "Stop",
                        action(context, SpeechControlReceiver.STOP))
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1));
        return builder.build();
    }

    private static PendingIntent action(Context context, String what) {
        Intent intent = new Intent(context, SpeechControlReceiver.class).setAction(what);
        return PendingIntent.getBroadcast(
                context, what.hashCode(), intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** The playback state the lock screen reads. Position is not reported: the
     *  unit here is a paragraph, not a millisecond, and a progress bar that
     *  cannot be scrubbed is a lie. */
    static PlaybackStateCompat state(boolean playing) {
        return new PlaybackStateCompat.Builder()
                .setActions(PlaybackStateCompat.ACTION_PLAY
                        | PlaybackStateCompat.ACTION_PAUSE
                        | PlaybackStateCompat.ACTION_STOP
                        | PlaybackStateCompat.ACTION_PLAY_PAUSE)
                .setState(
                        playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                        PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN,
                        1f)
                .build();
    }

    @SuppressWarnings("unused")
    private static void unusedImports(MediaMetadata metadata, PlaybackState state) {
    }
}
