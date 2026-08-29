package com.yejian.reader;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

@CapacitorPlugin(name = "BackgroundTts")
public class BackgroundTtsPlugin extends Plugin {
    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            JSObject event = new JSObject();
            event.put("state", intent.getStringExtra("state"));
            event.put("session", intent.getIntExtra("session", 0));
            if (intent.hasExtra("index")) event.put("index", intent.getIntExtra("index", 0));
            if (intent.hasExtra("message")) event.put("message", intent.getStringExtra("message"));
            notifyListeners("stateChange", event);
        }
    };

    @Override public void load() {
        IntentFilter filter = new IntentFilter(BackgroundTtsService.ACTION_EVENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter);
        }
    }

    @Override protected void handleOnDestroy() {
        try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
    }

    @PluginMethod public void start(PluginCall call) {
        JSArray values = call.getArray("texts");
        if (values == null || values.length() == 0) { call.reject("没有可朗读的文字"); return; }
        ArrayList<String> texts = new ArrayList<>();
        try {
            for (int i = 0; i < values.length(); i++) texts.add(values.getString(i));
        } catch (Exception error) { call.reject("朗读文字格式错误", error); return; }
        Intent intent = new Intent(getContext(), BackgroundTtsService.class);
        intent.setAction(BackgroundTtsService.ACTION_START);
        BackgroundTtsService.prepare(texts, call.getFloat("rate", 1f), call.getInt("session", 0));
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
            else getContext().startService(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("无法启动后台听书服务", error);
        }
    }

    @PluginMethod public void pause(PluginCall call) { command(BackgroundTtsService.ACTION_PAUSE); call.resolve(); }
    @PluginMethod public void resume(PluginCall call) { command(BackgroundTtsService.ACTION_RESUME); call.resolve(); }
    @PluginMethod public void stop(PluginCall call) { command(BackgroundTtsService.ACTION_STOP); call.resolve(); }

    private void command(String action) {
        Intent intent = new Intent(getContext(), BackgroundTtsService.class);
        intent.setAction(action);
        getContext().startService(intent);
    }
}
