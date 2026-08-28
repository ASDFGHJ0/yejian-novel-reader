# 网页版入口

此目录只负责页间网页版的 Vinext 路由入口：

- `page.tsx`：加载共用阅读器界面
- `layout.tsx`：网页标题、PWA 元数据和视口设置
- `globals.css`：加载共用样式

阅读器的存储、TXT 解析、听书、导出和主要界面位于 `src/reader/`，Android 离线版也会复用这些代码。
