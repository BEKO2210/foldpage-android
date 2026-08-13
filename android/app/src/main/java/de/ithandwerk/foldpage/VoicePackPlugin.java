package de.ithandwerk.foldpage;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The voices FoldPage brings itself.
 *
 * <p>A phone's own speech engines are what they are: on this device the default
 * one speaks a single German voice and no English at all, and the alternative
 * sounds like 2010. The only way to give a reader a good voice in their
 * language, without sending them to install another application, is to carry
 * the engine and fetch the voice.
 *
 * <p>So: sherpa-onnx (Apache-2.0) runs the model, and a voice is a
 * {@code .tar.bz2} of about twenty megabytes downloaded on demand, unpacked
 * into the app's own files directory and used offline from then on. Nothing is
 * bundled — two voices for five languages would be six hundred megabytes of
 * install, and Play would refuse it long before a reader did.
 *
 * <p>This class does four things and nothing else: download with progress,
 * unpack, list what is installed, and speak with it. Which voice to use for
 * which language, and what to say, stays in the web layer where the rest of the
 * product lives.
 */
@CapacitorPlugin(name = "FoldPageVoicePacks")
public class VoicePackPlugin extends Plugin {

    private static final String TAG = "FoldPageVoicePacks";
    /** Everything lives under one directory, one subdirectory per voice. */
    private static final String PACK_DIR = "voices";

    /** Two threads on purpose. Synthesis is the slow half — about half a second
     *  of work for a second of speech — and playing is the other. With one
     *  thread the reader hears a sentence, then silence while the next one is
     *  made. With two, the next sentence is being made while the current one is
     *  still being heard, and the silence between them is the pause the app
     *  chose rather than the pause the model needed. */
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final ExecutorService audio = Executors.newSingleThreadExecutor();
    /** At most a couple of sentences ahead: this is a lookahead, not a
     *  recording studio, and a minute of 22 kHz float audio is five megabytes. */
    private final Map<String, float[]> ready = new LinkedHashMap<String, float[]>() {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, float[]> eldest) {
            return size() > 3;
        }
    };
    private int readyRate = 22050;
    /** Cancellation is per pack: a reader who stops one download does not stop
     *  the other one they started a minute ago. */
    private final Map<String, AtomicBoolean> cancelled = new HashMap<>();

    private OfflineTts tts;
    private String loadedId;
    private AudioTrack track;
    private final AtomicBoolean speaking = new AtomicBoolean(false);

    private File packsRoot() {
        File root = new File(getContext().getFilesDir(), PACK_DIR);
        if (!root.exists() && !root.mkdirs()) {
            Log.w(TAG, "could not create " + root);
        }
        return root;
    }

    /** A pack is installed when its directory holds a model and its tokens. */
    private boolean isInstalled(File dir) {
        return modelFile(dir) != null && new File(dir, "tokens.txt").isFile();
    }

    /** The `.onnx` in a pack directory, whatever the voice happens to call it. */
    private File modelFile(File dir) {
        File[] files = dir.listFiles();
        if (files == null) return null;
        for (File file : files) {
            if (file.isFile() && file.getName().endsWith(".onnx")) return file;
        }
        return null;
    }

    private long sizeOf(File file) {
        if (file.isFile()) return file.length();
        File[] children = file.listFiles();
        long total = 0;
        if (children != null) {
            for (File child : children) total += sizeOf(child);
        }
        return total;
    }

    @PluginMethod
    public void list(PluginCall call) {
        JSArray packs = new JSArray();
        File[] dirs = packsRoot().listFiles();
        if (dirs != null) {
            for (File dir : dirs) {
                // `.new` and `.part` belong to a download that never finished —
                // a process killed mid-install leaves them behind.
                if (dir.getName().endsWith(".new") || dir.getName().endsWith(".part")) {
                    delete(dir);
                    continue;
                }
                if (!dir.isDirectory() || !isInstalled(dir)) continue;
                JSObject pack = new JSObject();
                pack.put("id", dir.getName());
                pack.put("bytes", sizeOf(dir));
                packs.put(pack);
            }
        }
        JSObject result = new JSObject();
        result.put("packs", packs);
        call.resolve(result);
    }

    /**
     * Fetch a pack and unpack it.
     *
     * <p>Downloaded here rather than in the web layer for two reasons: the
     * archive host answers with an {@code access-control-allow-origin} that does
     * not include the app's origin, so a fetch from the page is refused outright;
     * and a twenty-megabyte download wants to survive the page being reloaded.
     *
     * <p>Progress is reported as a {@code voicePackProgress} event — received
     * bytes and total, so the screen can show a real bar rather than a spinner.
     */
    @PluginMethod
    public void download(PluginCall call) {
        final String id = call.getString("id");
        final String url = call.getString("url");
        if (id == null || url == null) {
            call.reject("id and url are required");
            return;
        }
        final AtomicBoolean stop = new AtomicBoolean(false);
        cancelled.put(id, stop);
        work.execute(() -> {
            File target = new File(packsRoot(), id);
            File temp = new File(packsRoot(), id + ".part");
            // Unpacked beside the real thing and moved into place at the end.
            // The first version unpacked *into* the target and deleted it when
            // anything went wrong — so a download that failed on a bad
            // connection took the working voice with it, and the reader lost a
            // voice by asking for one.
            File staging = new File(packsRoot(), id + ".new");
            try {
                if (isInstalled(target)) {
                    JSObject already = new JSObject();
                    already.put("id", id);
                    already.put("bytes", sizeOf(target));
                    call.resolve(already);
                    return;
                }
                delete(temp);
                delete(staging);
                long received = fetch(url, temp, id, stop);
                if (stop.get()) {
                    delete(temp);
                    call.reject("cancelled");
                    return;
                }
                emit(id, "unpacking", received, received);
                if (!staging.mkdirs()) throw new IOException("could not create " + staging);
                unpack(temp, staging);
                delete(temp);
                if (!isInstalled(staging)) {
                    delete(staging);
                    throw new IOException("the archive held no voice");
                }
                delete(target);
                if (!staging.renameTo(target)) {
                    delete(staging);
                    throw new IOException("could not put the voice in place");
                }
                JSObject done = new JSObject();
                done.put("id", id);
                done.put("bytes", sizeOf(target));
                emit(id, "installed", sizeOf(target), sizeOf(target));
                call.resolve(done);
            } catch (Exception e) {
                // Only what this download made. An installed voice is not this
                // download's to remove.
                delete(temp);
                delete(staging);
                Log.w(TAG, "download failed", e);
                emit(id, "failed", 0, 0);
                call.reject(e.getMessage() == null ? "download failed" : e.getMessage());
            } finally {
                cancelled.remove(id);
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        AtomicBoolean stop = id == null ? null : cancelled.get(id);
        if (stop != null) stop.set(true);
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        if (id.equals(loadedId)) unload();
        delete(new File(packsRoot(), id));
        call.resolve();
    }

    /**
     * Say something in a downloaded voice.
     *
     * <p>Synthesis runs on the single background thread this class owns, so two
     * calls cannot be inside the model at the same time. The audio is played
     * through an {@link AudioTrack} on the media stream, which is the same
     * stream the system voice uses — a reader who turns the volume down for one
     * has turned it down for both.
     */
    @PluginMethod
    public void speak(PluginCall call) {
        final String id = call.getString("id");
        final String text = call.getString("text");
        final float speed = call.getFloat("speed", 1.0f);
        final int speaker = call.getInt("speaker", 0);
        if (id == null || text == null) {
            call.reject("id and text are required");
            return;
        }
        work.execute(() -> {
            try {
                final float[] samples = synthesise(id, text, speed, speaker);
                final int rate = readyRate;
                // Handed to the audio thread, which frees this one to make the
                // next sentence immediately.
                audio.execute(() -> {
                    play(samples, rate);
                    JSObject result = new JSObject();
                    result.put("samples", samples.length);
                    result.put("sampleRate", rate);
                    result.put("seconds", rate > 0 ? (double) samples.length / rate : 0);
                    call.resolve(result);
                });
            } catch (Throwable e) {
                Log.w(TAG, "speak failed", e);
                call.reject(e.getMessage() == null ? "speaking failed" : e.getMessage());
            }
        });
    }

    /**
     * Make a sentence ready without saying it.
     *
     * <p>Called for the sentence *after* the one being spoken. By the time the
     * reader gets there it is already made, so what they hear between two
     * sentences is the breath the app puts there rather than the model thinking.
     */
    @PluginMethod
    public void prepare(PluginCall call) {
        final String id = call.getString("id");
        final String text = call.getString("text");
        final float speed = call.getFloat("speed", 1.0f);
        final int speaker = call.getInt("speaker", 0);
        if (id == null || text == null) {
            call.reject("id and text are required");
            return;
        }
        work.execute(() -> {
            try {
                synthesise(id, text, speed, speaker);
                call.resolve();
            } catch (Throwable e) {
                // A lookahead that fails is not an error the reader should ever
                // meet: the real call will try again and report properly.
                Log.w(TAG, "prepare failed", e);
                call.resolve();
            }
        });
    }

    /** The model, or the cache if this sentence was made a moment ago. */
    private float[] synthesise(String id, String text, float speed, int speaker) throws IOException {
        String key = id + "|" + speed + "|" + speaker + "|" + text;
        synchronized (ready) {
            float[] cached = ready.get(key);
            if (cached != null) return cached;
        }
        load(id);
        GeneratedAudio audio = tts.generate(text, speaker, speed);
        float[] samples = audio.getSamples();
        synchronized (ready) {
            readyRate = audio.getSampleRate();
            ready.put(key, samples);
        }
        return samples;
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopTrack();
        synchronized (ready) {
            ready.clear();
        }
        call.resolve();
    }

    // ---------------------------------------------------------------- loading

    private void load(String id) throws IOException {
        if (tts != null && id.equals(loadedId)) return;
        File dir = new File(packsRoot(), id);
        File model = modelFile(dir);
        File tokens = new File(dir, "tokens.txt");
        if (model == null || !tokens.isFile()) throw new IOException("voice not installed: " + id);
        File espeak = new File(dir, "espeak-ng-data");
        File lexicon = new File(dir, "lexicon.txt");
        unload();
        OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
        vits.setModel(model.getAbsolutePath());
        vits.setTokens(tokens.getAbsolutePath());
        if (espeak.isDirectory()) vits.setDataDir(espeak.getAbsolutePath());
        if (lexicon.isFile()) vits.setLexicon(lexicon.getAbsolutePath());
        OfflineTtsModelConfig modelConfig = new OfflineTtsModelConfig();
        modelConfig.setVits(vits);
        // Two threads: the phone has eight cores and the reader is waiting, but
        // synthesis is not the only thing running — the article is on screen.
        modelConfig.setNumThreads(2);
        OfflineTtsConfig config = new OfflineTtsConfig();
        config.setModel(modelConfig);
        tts = new OfflineTts(null, config);
        loadedId = id;
    }

    private void unload() {
        if (tts != null) {
            try {
                tts.release();
            } catch (Throwable ignored) {
                /* releasing a model that was never allocated is not a fault */
            }
            tts = null;
        }
        loadedId = null;
    }

    // ---------------------------------------------------------------- playing

    private void play(float[] samples, int rate) {
        int min = AudioTrack.getMinBufferSize(
                rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT);
        int size = Math.max(min, samples.length * 4);
        AudioTrack player = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build())
                .setAudioFormat(new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                        .setSampleRate(rate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build())
                .setBufferSizeInBytes(size)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build();
        track = player;
        speaking.set(true);
        player.play();
        int offset = 0;
        while (offset < samples.length && speaking.get()) {
            int written = player.write(samples, offset, samples.length - offset,
                    AudioTrack.WRITE_BLOCKING);
            if (written <= 0) break;
            offset += written;
        }
        // The buffer holds the whole sentence, so writing it finishes long
        // before it has been *heard*. Without this wait the call resolved
        // early, the next sentence started, and its first act was to flush the
        // one still playing — every sentence lost its ending.
        while (speaking.get() && player.getPlaybackHeadPosition() < samples.length) {
            try {
                Thread.sleep(20);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        try {
            player.stop();
        } catch (Throwable ignored) {
            /* already stopped */
        }
        player.release();
        if (track == player) track = null;
        speaking.set(false);
    }

    private void stopTrack() {
        speaking.set(false);
        AudioTrack player = track;
        if (player != null) {
            try {
                player.pause();
                player.flush();
            } catch (Throwable ignored) {
                /* already gone */
            }
        }
    }

    // -------------------------------------------------------------- transport

    private long fetch(String from, File to, String id, AtomicBoolean stop) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(from).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(60000);
        connection.connect();
        int status = connection.getResponseCode();
        if (status / 100 != 2) throw new IOException("the download answered with " + status);
        long total = connection.getContentLengthLong();
        long received = 0;
        long lastEmit = 0;
        try (InputStream in = new BufferedInputStream(connection.getInputStream());
             OutputStream out = new FileOutputStream(to)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) > 0) {
                if (stop.get()) return received;
                out.write(buffer, 0, read);
                received += read;
                // Every quarter megabyte: often enough for a bar that moves,
                // seldom enough that the bridge is not the bottleneck.
                if (received - lastEmit > 256 * 1024) {
                    lastEmit = received;
                    emit(id, "downloading", received, total);
                }
            }
        } finally {
            connection.disconnect();
        }
        emit(id, "downloading", received, total);
        return received;
    }

    private void unpack(File archive, File into) throws IOException {
        try (InputStream in = new BufferedInputStream(new java.io.FileInputStream(archive));
             BZip2CompressorInputStream bz = new BZip2CompressorInputStream(in, true);
             TarArchiveInputStream tar = new TarArchiveInputStream(bz)) {
            TarArchiveEntry entry;
            while ((entry = tar.getNextEntry()) != null) {
                // The archives carry one top directory; its name is the model's,
                // not ours, so it is dropped and the contents land flat.
                String name = entry.getName();
                int slash = name.indexOf('/');
                String relative = slash >= 0 ? name.substring(slash + 1) : "";
                if (relative.isEmpty()) continue;
                File out = new File(into, relative);
                // A tar can name its way out of the directory it is unpacked
                // into. Ours come from a release we chose, but the check costs
                // nothing and the alternative is writing anywhere on the phone.
                if (!out.getCanonicalPath().startsWith(into.getCanonicalPath() + File.separator)) {
                    throw new IOException("archive entry outside the voice directory: " + name);
                }
                if (entry.isDirectory()) {
                    if (!out.isDirectory() && !out.mkdirs()) throw new IOException("mkdir " + out);
                    continue;
                }
                File parent = out.getParentFile();
                if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                    throw new IOException("mkdir " + parent);
                }
                try (OutputStream sink = new FileOutputStream(out)) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = tar.read(buffer)) > 0) sink.write(buffer, 0, read);
                }
            }
        }
    }

    private void delete(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) delete(child);
        }
        if (!file.delete()) Log.w(TAG, "could not delete " + file);
    }

    private void emit(String id, String phase, long received, long total) {
        JSObject event = new JSObject();
        event.put("id", id);
        event.put("phase", phase);
        event.put("received", received);
        event.put("total", total);
        notifyListeners("voicePackProgress", event);
    }
}
