# Android 离线网页外壳

此目录不是原生 Android 工程，而是打包进 Android WebView 的离线前端入口：

- `index.html`：离线页面
- `main.tsx`：挂载共用阅读器
- `mobile.css`：安全区域和手机专用样式

原生 Android 工程位于 `android/`，共用阅读器源码位于 `src/reader/`。
