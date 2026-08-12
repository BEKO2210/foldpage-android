package de.ithandwerk.foldpage;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Speaking, with the engine as part of the choice.
 *
 * <p>This exists because of one thing Android's own settings cannot express: a
 * phone has <em>one</em> default speech engine, and a reader has articles in
 * more than one language. On this device the neural German engine
 * (sherpa-onnx/Piper) carries a single German voice and says nothing in
 * English, while Google's engine speaks both but sounds a decade older. Setting
 * either one as the system default makes half the library worse.
 *
 * <p>So FoldPage keeps its own {@link TextToSpeech} per engine package and
 * picks by the article's language. Everything else — rate, pitch, the voice
 * inside that engine — is passed through, and the call resolves when the
 * utterance has actually finished, which is what lets the reader speak a
 * paragraph at a time and know where it is.
 *
 * <p>Not merged into the community TTS plugin on purpose: that one drives the
 * system default engine and is the fallback when no engine has been chosen for
 * a language. Two narrow paths beat one that has to be both.
 */
@CapacitorPlugin(name = "FoldPageSpeech")
public class SpeechPlugin extends Plugin {

    /** One engine, one instance, kept alive: binding to an engine takes about a
     *  second, and doing that per paragraph would be audible. */
    private final Map<String, TextToSpeech> engines = new HashMap<>();

    /** The call waiting for the utterance that is currently being spoken.
     *  Written from the bridge thread and read from the engine's callback
     *  thread, hence volatile. */
    private volatile PluginCall speaking;
    private final AtomicInteger utteranceId = new AtomicInteger();

    @Override
    protected void handleOnDestroy() {
        for (TextToSpeech tts : engines.values()) {
            tts.stop();
            tts.shutdown();
        }
        engines.clear();
        super.handleOnDestroy();
    }

    /** Every speech engine installed on the phone, with the label a user would
     *  recognise from Android's own settings screen. */
    @PluginMethod
    public void listEngines(PluginCall call) {
        TextToSpeech probe = new TextToSpeech(getContext(), status -> {});
        JSArray list = new JSArray();
        for (TextToSpeech.EngineInfo info : probe.getEngines()) {
            JSObject item = new JSObject();
            item.put("packageName", info.name);
            item.put("label", info.label);
            list.put(item);
        }
        JSObject answer = new JSObject();
        answer.put("engines", list);
        answer.put("defaultEngine", probe.getDefaultEngine());
        probe.shutdown();
        call.resolve(answer);
    }

    /** The voices one engine offers. */
    @PluginMethod
    public void listVoices(PluginCall call) {
        String engine = call.getString("engine");
        withEngine(engine, call, tts -> {
            JSArray list = new JSArray();
            Set<Voice> voices = null;
            try {
                voices = tts.getVoices();
            } catch (Exception ignored) {
                // Some engines throw rather than return an empty set.
            }
            if (voices != null) {
                for (Voice voice : voices) {
                    JSObject item = new JSObject();
                    item.put("name", voice.getName());
                    item.put("lang", tagOf(voice.getLocale()));
                    item.put("voiceURI", voice.getName());
                    // "Requires network" is the one property that matters here:
                    // a voice that phones home would break the only promise the
                    // app makes.
                    item.put("localService", !voice.isNetworkConnectionRequired());
                    item.put("default", false);
                    item.put("quality", voice.getQuality());
                    list.put(item);
                }
            }
            JSObject answer = new JSObject();
            answer.put("voices", list);
            call.resolve(answer);
        });
    }

    /**
     * Speaks one utterance and resolves when it is finished.
     *
     * <p>Finished, not started: the reader marks the paragraph it is on and
     * moves to the next one when this promise comes back, so an early resolve
     * would race the voice through the article in silence.
     */
    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.isEmpty()) {
            call.resolve();
            return;
        }
        String engine = call.getString("engine");
        String lang = call.getString("lang");
        String voiceName = call.getString("voice");
        float rate = call.getFloat("rate", 1f);
        float pitch = call.getFloat("pitch", 1f);

        withEngine(engine, call, tts -> {
            finishPending();
            if (lang != null && !lang.isEmpty()) {
                tts.setLanguage(Locale.forLanguageTag(lang));
            }
            if (voiceName != null && !voiceName.isEmpty()) {
                Set<Voice> voices = tts.getVoices();
                if (voices != null) {
                    for (Voice voice : voices) {
                        if (voiceName.equals(voice.getName())) {
                            tts.setVoice(voice);
                            break;
                        }
                    }
                }
            }
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);
            speaking = call;
            String id = "fp-" + utteranceId.incrementAndGet();
            int queued = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
            if (queued != TextToSpeech.SUCCESS) {
                speaking = null;
                call.reject("The engine refused the text");
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        for (TextToSpeech tts : engines.values()) {
            tts.stop();
        }
        finishPending();
        call.resolve();
    }

    /** Ends the utterance in flight, if there is one.
     *
     *  <p>Always a resolve, never a reject: being stopped, or replaced by the
     *  next paragraph, is not a failure — and a rejected call here would put an
     *  error message on the reader's screen for something they did on purpose. */
    private synchronized void finishPending() {
        PluginCall pending = speaking;
        speaking = null;
        if (pending != null) pending.resolve();
    }

    private interface Ready {
        void run(TextToSpeech tts);
    }

    /** Hands over a bound engine, binding it first if this is its first use.
     *
     *  <p>The init callback is the only signal that an engine is usable; calling
     *  speak() before it arrives is silently dropped by the framework, which is
     *  exactly the kind of silence this whole feature has already cost a day
     *  to. */
    private void withEngine(String enginePackage, PluginCall call, Ready then) {
        if (enginePackage == null || enginePackage.isEmpty()) {
            call.reject("No engine named");
            return;
        }
        TextToSpeech existing = engines.get(enginePackage);
        if (existing != null) {
            then.run(existing);
            return;
        }
        final TextToSpeech[] holder = new TextToSpeech[1];
        holder[0] = new TextToSpeech(getContext(), status -> {
            if (status != TextToSpeech.SUCCESS) {
                call.reject("The engine " + enginePackage + " did not start");
                return;
            }
            holder[0].setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String id) {
                }

                @Override
                public void onDone(String id) {
                    finishPending();
                }

                @Override
                public void onError(String id) {
                    PluginCall pending = speaking;
                    speaking = null;
                    if (pending != null) pending.reject("The engine failed on this text");
                }
            });
            engines.put(enginePackage, holder[0]);
            then.run(holder[0]);
        }, enginePackage);
    }

    private static String tagOf(Locale locale) {
        if (locale == null) return "";
        String tag = locale.toLanguageTag();
        // Android hands back three-letter tags like "deu-DEU" from some
        // engines; the web side compares on the two-letter base, so both work,
        // but the shorter one is what a person recognises in a list.
        return tag.replace("deu", "de").replace("eng", "en");
    }

}
