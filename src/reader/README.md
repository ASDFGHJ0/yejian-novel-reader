# 共享阅读核心

这里是网页端与 Android 端共同使用的阅读器代码。

- `ReaderApp.tsx`：阅读器界面与交互编排
- `types.ts`：共享数据类型
- `storage.ts`：书架、章节和备份的本地存储
- `novel.tsx`：TXT 解码、章节识别、导出命名等文本处理
- `speech.ts`：听书文本分段

网页入口在 `app/`，Android 外壳在 `mobile/` 与 `android/`。修改共享阅读功能时，通常从本目录开始。
