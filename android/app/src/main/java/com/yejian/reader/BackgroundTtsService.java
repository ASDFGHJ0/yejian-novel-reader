package com.yejian.reader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import androidx.core.app.NotificationCompat;
import java.util.ArrayList;
import java.util.Locale;

public class BackgroundTtsService extends Service implements TextToSpeech.OnInitListener {
    public static final String ACTION_START = "com.yejian.reader.tts.START";
    public static final String ACTION_PAUSE = "com.yejian.reader.tts.PAUSE";
    public static final String ACTION_RESUME = "com.yejian.reader.tts.RESUME";
    public static final String ACTION_STOP = "com.yejian.reader.tts.STOP";
    public static final String ACTION_EVENT = "com.yejian.reader.tts.EVENT";
    private static final String CHANNEL_ID = "yejian_tts";
    private static final int NOTIFICATION_ID = 7301;
    private static ArrayList<String> pendingTexts = new ArrayList<>();
    private static float pendingRate = 1f;
    private static int pendingSession = 0;

    private TextToSpeech tts;
    private ArrayList<String> texts = new ArrayList<>();
    private int index = 0;
    private float rate = 1f;
    private boolean ready = false;
    private boolean paused = false;
    private int session = 0;
    private PowerManager.WakeLock wakeLock;

    public static synchronized void prepare(ArrayList<String> values, float speechRate, int sessionId) {
        pendingTexts = new ArrayList<>(values);
        pendingRate = speechRate;
        pendingSession = sessionId;
    }

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        tts = new TextToSpeech(this, this);
        PowerManager manager = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Yejian:TtsPlayback");
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_START.equals(action)) {
            synchronized (BackgroundTtsService.class) {
                texts = new ArrayList<>(pendingTexts);
                rate = pendingRate;
                session = pendingSession;
                pendingTexts.clear();
            }
            index = 0;
            paused = false;
            startForeground(NOTIFICATION_ID, notification("正在准备听书…"));
            if (!wakeLock.isHeld()) wakeLock.acquire();
            if (ready) speakCurrent();
        } else if (ACTION_PAUSE.equals(action)) {
            paused = true;
            if (tts != null) tts.stop();
            updateNotification("听书已暂停");
        } else if (ACTION_RESUME.equals(action)) {
            paused = false;
            speakCurrent();
        } else if (ACTION_STOP.equals(action)) {
            finish(false);
        }
        return START_NOT_STICKY;
    }

    @Override public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        if (!ready) { sendEvent("error", -1, "手机语音引擎初始化失败"); finish(false); return; }
        tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) { sendEvent("sentence", index, null); updateNotification("正在朗读 · 第 " + (index + 1) + " 句"); }
            @Override public void onDone(String utteranceId) { index++; if (index >= texts.size()) finish(true); else speakCurrent(); }
            @Override public void onError(String utteranceId) { sendEvent("error", index, "朗读过程中发生错误"); finish(false); }
        });
        if (!texts.isEmpty() && !paused) speakCurrent();
    }

    private void speakCurrent() {
        if (!ready || paused || index >= texts.size()) return;
        tts.setSpeechRate(rate);
        tts.speak(texts.get(index), TextToSpeech.QUEUE_FLUSH, null, "sentence-" + index);
    }

    private void finish(boolean completed) {
        if (tts != null) tts.stop();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (completed) sendEvent("completed", index, null);
        stopForeground(true);
        stopSelf();
    }

    private void sendEvent(String state, int itemIndex, String message) {
        Intent event = new Intent(ACTION_EVENT).setPackage(getPackageName()).putExtra("state", state).putExtra("session", session);
        if (itemIndex >= 0) event.putExtra("index", itemIndex);
        if (message != null) event.putExtra("message", message);
        sendBroadcast(event);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "听书播放", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("页间锁屏听书服务");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private Notification notification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("页间 · 听书")
            .setContentText(text)
            .setContentIntent(pending)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build();
    }

    private void updateNotification(String text) {
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID, notification(text));
    }

    @Override public void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
