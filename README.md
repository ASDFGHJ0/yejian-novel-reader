# 页间 · 本地 TXT 小说阅读器

页间是一款以隐私和舒适阅读为核心的本地 TXT 小说阅读器。小说正文、阅读进度、书签和笔记保存在当前浏览器中，不会上传到服务器。

当前版本：`v0.3.7`

## 功能

- 导入 UTF-8、GBK / GB18030、Big5 编码的 TXT
- 自动识别常见中文章节标题，支持超长 TXT 分段
- IndexedDB 分章存储，按章加载大文件
- 自动保存当前书籍、章节、滚动位置和阅读进度
- 全书架或指定小说的正文搜索
- 章节书签、右键文字标记、摘录和笔记
- 字号、行距、版心、字体与三种阅读主题
- 阅读时长统计及多种书架排序
- 完整书架备份与恢复
- 按章节范围导出 TXT：逐章、全部合并或每 N 章分组
- 多个导出任务后台并行，不阻断阅读
- PWA 桌面安装和应用外壳离线打开
- Android 离线 APK：无需电脑或服务器即可阅读
- 网页与 Android 原生听书，支持 0.3×–4.0× 语速、起点选择和睡眠定时
- 听书段落高亮与跟随滚动，可连续朗读下一章
- 1–10 档自动滚屏，到章末自动进入下一章

## 本地启动

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

浏览器打开终端显示的地址，通常为 <http://localhost:3000>。

构建生产版本：

```bash
npm run build
npm run start
```

## Android 构建

Android 版使用 Capacitor 封装，最低支持 Android 7.0。首次构建需要 JDK 21 和 Android SDK API 36。

```bash
npm run android:apk
```

生成的调试 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。完整说明见 [`docs/ANDROID.md`](docs/ANDROID.md)。

## 使用提示

### 乱码处理

导入 TXT 时可以选择自动识别、UTF-8、GB18030 或 Big5。如果导入结果乱码，请删除该书并用另一种编码重新导入。源文件本身已经损坏时无法通过切换编码恢复。

### 按章节导出

在书架点击书籍右下角的 `•••`，选择“导出章节…”。可以指定起止章节，并选择：

- 每章一个 TXT
- 合并为一个 TXT
- 每 N 章合并一个 TXT

文件夹导出需要最新版 Chrome 或 Edge。导出任务运行时不要刷新或关闭页面。

### 数据与备份

书架数据保存在浏览器 IndexedDB 中。清除网站数据、更换浏览器、端口或设备会形成不同书架。建议定期使用“导出备份”，并保留原始 TXT。

备份包含小说正文、目录、阅读位置、阅读统计、书签、摘录和笔记。

## 项目结构

```text
yejian-novel-reader/
├─ app/                 网页版入口（Vinext / React）
├─ src/reader/          网页版与 Android 共用的阅读器核心
├─ public/              网页版 PWA 图标、清单和 Service Worker
├─ worker/              网页托管使用的 Cloudflare Worker
├─ mobile/              Android 内嵌的离线网页外壳
├─ android/             原生 Android / Capacitor 工程
├─ docs/                项目文档、现状和更新记录
├─ .openai/             Sites 托管配置
└─ package.json         网页与 Android 的统一构建命令
```

快速辨认：

- 只关心网页：查看 [`app/`](app/) 和 [`public/`](public/)。
- 只关心手机 App：查看 [`mobile/`](mobile/) 和 [`android/`](android/)。
- 修改两端共用功能：查看 `src/reader/`。
- 查看说明：进入 [`docs/`](docs/)。

## 技术栈

React 19、TypeScript、Vinext、Vite、Cloudflare Workers、IndexedDB、PWA、Capacitor、Android TTS。

## 隐私与版权

应用不主动上传小说内容。请仅整理和阅读自己合法持有的文本，不要传播未经授权的作品。
