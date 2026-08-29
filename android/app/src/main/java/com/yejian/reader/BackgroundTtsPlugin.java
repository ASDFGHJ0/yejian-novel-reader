package com.yejian.reader;

import android.content.Context;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(name = "BackgroundTts")
public class BackgroundTtsPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private final ArrayList<String> texts = new ArrayList<>();
    private int index = 0;
    private int session = 0;
    private float rate = 1f;
    private boolean ready = false;
    private boolean pendingStart = false;
    private PowerManager.WakeLock wakeLock;

    @Override public void load() {
        PowerManager manager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Yejian:TtsPlayback");
    }

    @PluginMethod public void start(PluginCall call) {
        JSArray values = call.getArray("texts");
        if (values == null || values.length() == 0) { call.reject("没有可朗读的文字"); return; }
        texts.clear();
        try {
            for (int i = 0; i < values.length(); i++) texts.add(values.getString(i));
        } catch (Exception error) { call.reject("朗读文字格式错误", error); return; }
        index = 0;
        session = call.getInt("session", 0);
        rate = call.getFloat("rate", 1f);
        pendingStart = true;
        try {
            acquireWakeLock();
            if (tts == null) tts = new TextToSpeech(getContext(), this);
            else if (ready) queueFromCurrent();
            call.resolve();
        } catch (Exception error) {
            releaseWakeLock();
            call.reject("无法启动手机语音引擎", error);
        }
    }

    @Override public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        if (!ready) {
            emit("error", -1, "手机语音引擎初始化失败");
            releaseWakeLock();
            return;
        }
        tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) {
                int playing = parseIndex(utteranceId);
                if (playing >= 0) { index = playing; emit("sentence", playing, null); }
            }
            @Override public void onDone(String utteranceId) {
                int finished = parseIndex(utteranceId);
                if (finished == texts.size() - 1) {
                    index = texts.size();
                    releaseWakeLock();
                    emit("completed", index, null);
                }
            }
            @Override public void onError(String utteranceId) {
                releaseWakeLock();
                emit("error", parseIndex(utteranceId), "朗读过程中发生错误");
            }
        });
        if (pendingStart) queueFromCurrent();
    }

    private synchronized void queueFromCurrent() {
        if (!ready || tts == null || index >= texts.size()) return;
        pendingStart = false;
        tts.stop();
        tts.setSpeechRate(rate);
        for (int item = index; item < texts.size(); item++) {
            tts.speak(texts.get(item), item == index ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, session + ":" + item);
        }
    }

    @PluginMethod public void pause(PluginCall call) {
        if (tts != null) tts.stop();
        releaseWakeLock();
        call.resolve();
    }

    @PluginMethod public void resume(PluginCall call) {
        acquireWakeLock();
        queueFromCurrent();
        call.resolve();
    }

    @PluginMethod public void stop(PluginCall call) {
        pendingStart = false;
        texts.clear();
        index = 0;
        if (tts != null) tts.stop();
        releaseWakeLock();
        call.resolve();
    }

    private int parseIndex(String utteranceId) {
        try { return Integer.parseInt(utteranceId.substring(utteranceId.indexOf(':') + 1)); }
        catch (Exception ignored) { return -1; }
    }

    private void emit(String state, int itemIndex, String message) {
        JSObject event = new JSObject();
        event.put("state", state);
        event.put("session", session);
        if (itemIndex >= 0) event.put("index", itemIndex);
        if (message != null) event.put("message", message);
        notifyListeners("stateChange", event);
    }

    private void acquireWakeLock() {
        if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(4 * 60 * 60 * 1000L);
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    @Override protected void handleOnDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        releaseWakeLock();
    }
}
