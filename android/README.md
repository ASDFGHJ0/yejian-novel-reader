# 原生 Android 工程

此目录由 Capacitor 管理，包含 Gradle、AndroidManifest、图标、启动图和原生插件配置。

- App 包名：`com.yejian.reader`
- 最低系统：Android 7.0（API 24）
- 目标系统：Android 16（API 36）
- 原生能力：文件系统、系统中文 TTS

通常不要直接编辑生成文件。日常功能代码位于 `src/reader/`；修改后在仓库根目录执行 `npm run android:sync`。

安装、数据和构建方法见 [`../docs/ANDROID.md`](../docs/ANDROID.md)。
