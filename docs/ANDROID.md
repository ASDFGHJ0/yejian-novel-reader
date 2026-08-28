# 页间 Android 版

页间 Android 版是完全离线运行的自用 TXT 小说阅读器，不需要电脑保持开机，也不连接页间服务器。

## 安装

将生成的 APK 发送到安卓手机，在文件管理器中点击安装。首次安装需要允许当前文件管理器“安装未知应用”。

当前测试 APK 使用 Android 调试签名，适合个人设备测试。最低支持 Android 7.0（API 24），目标版本为 Android 16（API 36）。

## 数据与文件

- 书架、章节、进度、书签和笔记保存在 App 本地存储中。
- 卸载 App 可能删除本地书架，卸载前应先导出备份。
- 章节导出和书架备份位于手机 `Documents/YejianExports`。
- 电脑与手机书架不会自动同步，可通过 JSON 备份迁移。

## 听书与自动阅读

- 顶部“听书”支持播放、暂停、停止和 0.3×–4.0× 语速。
- 可选择正文任意段落作为朗读起点。
- 可设置 15、30、60 或 90 分钟睡眠定时。
- 可连续朗读下一章；当前段落会高亮并跟随滚动。
- 顶部“自动”是独立的自动滚屏功能，支持 1–10 档速度和自动换章。

## 本地构建

需要 Node.js 22.13+、JDK 21 和 Android SDK API 36。

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-21'
$env:ANDROID_HOME = 'C:\path\to\Android\Sdk'
npm install
npm run android:apk
```

APK 生成位置：`android/app/build/outputs/apk/debug/app-debug.apk`。

Android SDK 的本机路径保存在 `android/local.properties`，该文件已被 Git 忽略，不应提交到仓库。
