package com.yejian.reader;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundTtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
