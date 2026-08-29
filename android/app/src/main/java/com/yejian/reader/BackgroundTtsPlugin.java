package com.yejian.reader;

import android.content.Context;
import android.media.AudioAttributes;
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
            else if (ready) speakCurrent();
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
        int language = tts.setLanguage(Locale.CHINA);
        if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED) {
            emit("error", -1, "手机语音引擎缺少中文语音，请在系统文字转语音设置中安装中文语音包");
            releaseWakeLock();
            return;
        }
        tts.setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build());
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) {
                int playing = parseIndex(utteranceId);
                if (playing >= 0) { index = playing; emit("sentence", playing, null); }
            }
            @Override public void onDone(String utteranceId) {
                int finished = parseIndex(utteranceId);
                if (finished >= 0) index = finished + 1;
                if (index >= texts.size()) {
                    index = texts.size();
                    releaseWakeLock();
                    emit("completed", index, null);
                } else speakCurrent();
            }
            @Override public void onError(String utteranceId) {
                releaseWakeLock();
                emit("error", parseIndex(utteranceId), "朗读过程中发生错误");
            }
        });
        if (pendingStart) speakCurrent();
    }

    private synchronized void speakCurrent() {
        if (!ready || tts == null || index >= texts.size()) return;
        pendingStart = false;
        tts.setSpeechRate(rate);
        int result = tts.speak(texts.get(index), TextToSpeech.QUEUE_FLUSH, null, session + ":" + index);
        if (result == TextToSpeech.ERROR) {
            releaseWakeLock();
            emit("error", index, "手机语音引擎拒绝朗读，请检查系统文字转语音设置和媒体音量");
        }
    }

    @PluginMethod public void pause(PluginCall call) {
        if (tts != null) tts.stop();
        releaseWakeLock();
        call.resolve();
    }

    @PluginMethod public void resume(PluginCall call) {
        acquireWakeLock();
        speakCurrent();
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
