"use client";
import TtsDiagnostics from "./TtsDiagnostics";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { QueueStrategy, TextToSpeech } from "@capacitor-community/text-to-speech";

import type {
  BackupFile,
  BookMeta,
  Chapter,
  ExportDirectoryHandle,
  ExportJob,
  ExportMode,
  InstallPromptEvent,
  ReaderSettings,
  SearchHit,
  SpeechPart,
  TxtEncoding,
} from "./types";
import {
  deleteBook,
  exportLibrary,
  getBooks,
  getChapter,
  restoreLibrary,
  saveBook,
  updateProgress,
} from "./storage";
import {
  chapterFileName,
  decodeTxt,
  DEMO,
  formatDuration,
  formatSize,
  parseNovel,
  readPercent,
  renderMarkedText,
  safeFileName,
} from "./novel";
import { chapterSpeechParts } from "./speech";

const DEFAULT_SETTINGS: ReaderSettings = { font: 20, lineHeight: 2, width: 700, family: "serif" };
const IS_NATIVE_APP = Capacitor.isNativePlatform();
const MOBILE_EXPORT_ROOT = "YejianExports";

export default function ReaderApp() {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [active, setActive] = useState<BookMeta | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [toc, setToc] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; quote: string } | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [sortMode, setSortMode] = useState("recent");
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [theme, setTheme] = useState("paper");
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [manage, setManage] = useState<BookMeta | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [exportBook, setExportBook] = useState<BookMeta | null>(null);
  const [exportStart, setExportStart] = useState(1);
  const [exportEnd, setExportEnd] = useState(1);
  const [exportMode, setExportMode] = useState<ExportMode>("separate");
  const [exportGroupSize, setExportGroupSize] = useState(20);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchBookId, setSearchBookId] = useState("all");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ttsStatus, setTtsStatus] = useState<"idle" | "playing" | "paused">("idle");
  const [ttsRate, setTtsRate] = useState(1);
  const [ttsPickStart, setTtsPickStart] = useState(false);
  const [ttsAutoRead, setTtsAutoRead] = useState(true);
  const [ttsDeadline, setTtsDeadline] = useState<number | null>(null);
  const [ttsRemaining, setTtsRemaining] = useState(0);
  const [ttsActiveParagraph, setTtsActiveParagraph] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(2);
  const input = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const ttsToken = useRef(0);
  const ttsParts = useRef<SpeechPart[]>([]);
  const ttsIndex = useRef(0);
  const nativeTtsBase = useRef(0);
  const ttsAutoReadRef = useRef(true);
  const ttsRateRef = useRef(1);
  const activeRef = useRef<BookMeta | null>(null);
  const autoScrollChanging = useRef(false);
  ttsAutoReadRef.current = ttsAutoRead;
  ttsRateRef.current = ttsRate;
  activeRef.current = active;

  useEffect(() => {
    const savedSettings = localStorage.getItem("yejian-reader-settings");
    if (savedSettings) try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) }); } catch { /* use defaults */ }
    (async () => {
      try {
        let stored = await getBooks();
        if (!stored.length) {
          await saveBook(DEMO);
          stored = await getBooks();
        }
        setBooks(stored);
        const activeBookId = localStorage.getItem("yejian-active-book");
        const resumed = stored.find(book => book.id === activeBookId);
        if (resumed) {
          setChapter(await getChapter(resumed.id, resumed.current || 0));
          setActive(resumed);
        } else if (activeBookId) {
          localStorage.removeItem("yejian-active-book");
        }
      } catch { setError("无法打开本地书架，请检查浏览器是否允许本地存储。"); }
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem("yejian-reader-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!active || !chapter) return;
    requestAnimationFrame(() => window.scrollTo({ top: active.scroll || 0 }));
    let timer: ReturnType<typeof setTimeout>;
    const remember = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const updated = { ...active, scroll: Math.round(window.scrollY), at: Date.now() };
        setActive(updated);
        setBooks(old => old.map(book => book.id === updated.id ? updated : book));
        updateProgress(updated).catch(console.error);
      }, 350);
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => { clearTimeout(timer); window.removeEventListener("scroll", remember); };
  }, [active?.id, active?.current, chapter]);

  useEffect(() => {
    if (!active || !chapter) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setActive(current => {
        if (!current) return current;
        const updated = { ...current, readSeconds: (current.readSeconds || 0) + 30 };
        setBooks(old => old.map(book => book.id === updated.id ? updated : book));
        updateProgress(updated).catch(console.error);
        return updated;
      });
    }, 30000);
    return () => window.clearInterval(timer);
  }, [active?.id, chapter]);

  useEffect(() => {
    if (!active) return;
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); jump(active.current - 1); }
      if (event.key === "ArrowRight") { event.preventDefault(); jump(active.current + 1); }
      if (event.key === "Escape") { setSelectionMenu(null); setToc(false); setNotesOpen(false); setSettingsOpen(false); }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [active?.id, active?.current]);

  useEffect(() => {
    if (IS_NATIVE_APP) return;
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(registration => {
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) setNotice("页间已下载更新，请在完成当前操作后刷新页面。");
            });
          });
          void registration.update().catch(console.error);
        }).catch(console.error);
      } else {
        // A production service worker must not cache Vite's development client.
        navigator.serviceWorker.getRegistrations()
          .then(registrations => Promise.all(registrations.filter(registration => new URL((registration.active || registration.waiting || registration.installing)?.scriptURL || "/", location.href).pathname === "/sw.js").map(registration => registration.unregister())))
          .catch(console.error);
        if ("caches" in window) {
          caches.keys()
            .then(keys => Promise.all(keys.filter(key => key.startsWith("yejian-app-")).map(key => caches.delete(key))))
            .catch(console.error);
        }
      }
    }
    const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const complete = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    return () => { window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", complete); };
  }, []);

  async function installApp() {
    if (installed) { setError("页间已经作为桌面 App 运行。"); return; }
    if (!installPrompt) { setError("如果没有弹出安装窗口，请在浏览器右上角菜单中选择“安装页间”或“将页面作为应用安装”。"); return; }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  async function finishTts(token: number) {
    if (token !== ttsToken.current) return;
    const currentBook = activeRef.current;
    if (ttsAutoReadRef.current && currentBook && currentBook.current < currentBook.chapterTitles.length - 1) {
      const nextIndex = currentBook.current + 1;
      const nextChapter = await getChapter(currentBook.id, nextIndex);
      if (token !== ttsToken.current) return;
      const updated = { ...currentBook, current: nextIndex, scroll: 0, at: Date.now() };
      activeRef.current = updated;
      setChapter(nextChapter);
      setActive(updated);
      setBooks(old => old.map(book => book.id === updated.id ? updated : book));
      await updateProgress(updated);
      window.scrollTo({ top: 0, behavior: "smooth" });
      ttsParts.current = chapterSpeechParts(nextChapter);
      ttsIndex.current = 0;
      const nextToken = ++ttsToken.current;
      if (IS_NATIVE_APP) void playNativeTts(nextToken);
      else playWebTts(nextToken);
      return;
    }
    ttsIndex.current = 0;
    setTtsActiveParagraph(-1);
    setTtsStatus("idle");
  }

  async function playNativeTts(token: number) {
    try {
      nativeTtsBase.current = ttsIndex.current;
      const remaining = ttsParts.current.slice(ttsIndex.current);
      if (!remaining.length) { void finishTts(token); return; }
      syncTtsParagraph(remaining[0].paragraph);
      const jobs = remaining.map((part, offset) => TextToSpeech.speak({
        text: part.text,
        lang: "zh-CN",
        rate: ttsRateRef.current,
        pitch: 1,
        volume: 1,
        queueStrategy: offset === 0 ? QueueStrategy.Flush : QueueStrategy.Add,
      }).then(() => {
        if (token !== ttsToken.current) return;
        const nextIndex = nativeTtsBase.current + offset + 1;
        ttsIndex.current = nextIndex;
        const next = ttsParts.current[nextIndex];
        if (next) syncTtsParagraph(next.paragraph);
      }));
      await Promise.all(jobs);
      if (token === ttsToken.current) void finishTts(token);
    } catch (reason) {
      if (token === ttsToken.current) {
        console.error(reason);
        setTtsStatus("idle");
        setError("听书启动失败：" + (reason instanceof Error ? reason.message : String(reason)));
      }
    }
  }

  function playWebTts(token: number) {
    if (token !== ttsToken.current) return;
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setTtsStatus("idle");
      setError("当前浏览器不支持听书，请尝试最新版 Edge 或 Chrome。");
      return;
    }
    if (ttsIndex.current >= ttsParts.current.length) { void finishTts(token); return; }
    const part = ttsParts.current[ttsIndex.current];
    syncTtsParagraph(part.paragraph);
    const utterance = new SpeechSynthesisUtterance(part.text);
    utterance.lang = "zh-CN";
    utterance.rate = ttsRateRef.current;
    utterance.onend = () => {
      if (token !== ttsToken.current) return;
      ttsIndex.current += 1;
      playWebTts(token);
    };
    utterance.onerror = event => {
      if (token !== ttsToken.current || event.error === "canceled" || event.error === "interrupted") return;
      setTtsStatus("idle");
      setError("听书被浏览器中断，请重新点击播放。");
    };
    window.speechSynthesis.speak(utterance);
  }

  async function toggleTts() {
    if (!chapter) return;
    if (ttsStatus === "playing") {
      if (IS_NATIVE_APP) {
        ttsToken.current += 1;
        await TextToSpeech.stop().catch(() => undefined);
      } else window.speechSynthesis.pause();
      setTtsStatus("paused");
      return;
    }
    if (ttsStatus === "paused") {
      setTtsStatus("playing");
      if (IS_NATIVE_APP) {
        const token = ++ttsToken.current;
        void playNativeTts(token);
      } else window.speechSynthesis.resume();
      return;
    }
    await startTtsFrom(chapterSpeechParts(chapter));
  }

  function syncTtsParagraph(index: number) {
    setTtsActiveParagraph(index);
    if (index < 0) return;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-tts-paragraph="${index}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function startTtsFrom(parts: SpeechPart[]) {
    setAutoScroll(false);
    ttsToken.current += 1;
    if (IS_NATIVE_APP) await TextToSpeech.stop().catch(() => undefined);
    else if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    ttsParts.current = parts;
    ttsIndex.current = 0;
    const token = ++ttsToken.current;
    setError("");
    setTtsStatus("playing");
    if (IS_NATIVE_APP) void playNativeTts(token);
    else playWebTts(token);
  }

  function selectTtsRate(rate: number) {
    setTtsRate(rate);
    ttsRateRef.current = rate;
  }

  async function applyTtsRate(rate = ttsRateRef.current) {
    selectTtsRate(rate);
    if (ttsStatus !== "playing") return;
    const index = ttsIndex.current;
    ttsToken.current += 1;
    if (IS_NATIVE_APP) await TextToSpeech.stop().catch(() => undefined);
    else if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    ttsIndex.current = index;
    const token = ++ttsToken.current;
    if (IS_NATIVE_APP) void playNativeTts(token);
    else playWebTts(token);
    setNotice(`语速已切换为 ${rate.toFixed(1)}×`);
  }

  async function startTtsAtParagraph(index: number) {
    if (!chapter) return;
    setTtsPickStart(false);
    setNotice(`已从第 ${index + 1} 段开始听书`);
    await startTtsFrom(chapterSpeechParts(chapter, index, false));
  }

  async function stopTts() {
    ttsToken.current += 1;
    ttsIndex.current = 0;
    if (IS_NATIVE_APP) await TextToSpeech.stop().catch(() => undefined);
    else if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setTtsStatus("idle");
    setTtsPickStart(false);
    setTtsActiveParagraph(-1);
    setTtsDeadline(null);
  }

  useEffect(() => () => {
    ttsToken.current += 1;
    if (IS_NATIVE_APP) void TextToSpeech.stop().catch(() => undefined);
    else if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    if (!ttsDeadline) { setTtsRemaining(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((ttsDeadline - Date.now()) / 1000));
      setTtsRemaining(remaining);
      if (!remaining) {
        setTtsDeadline(null);
        void stopTts();
        setNotice("听书定时已结束");
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [ttsDeadline]);

  function setSleepTimer(minutes: number) {
    setTtsDeadline(minutes ? Date.now() + minutes * 60 * 1000 : null);
    setNotice(minutes ? `听书将在 ${minutes} 分钟后停止` : "已关闭听书定时");
  }

  async function advanceAutoScrollChapter() {
    if (autoScrollChanging.current) return;
    const currentBook = activeRef.current;
    if (!currentBook) return;
    if (currentBook.current >= currentBook.chapterTitles.length - 1) {
      setAutoScroll(false);
      setNotice("已自动阅读到全书末尾");
      return;
    }
    autoScrollChanging.current = true;
    try {
      const nextIndex = currentBook.current + 1;
      const nextChapter = await getChapter(currentBook.id, nextIndex);
      const updated = { ...currentBook, current: nextIndex, scroll: 0, at: Date.now() };
      activeRef.current = updated;
      setChapter(nextChapter);
      setActive(updated);
      setBooks(old => old.map(book => book.id === updated.id ? updated : book));
      await updateProgress(updated);
      window.scrollTo({ top: 0 });
    } finally {
      window.setTimeout(() => { autoScrollChanging.current = false; }, 500);
    }
  }

  async function toggleAutoScroll() {
    if (autoScroll) { setAutoScroll(false); return; }
    await stopTts();
    setAutoScroll(true);
    setNotice("自动阅读已开始");
  }

  useEffect(() => {
    if (!autoScroll || !active || !chapter) return;
    let frame = 0;
    let last = performance.now();
    const move = (now: number) => {
      const elapsed = Math.min(100, now - last);
      last = now;
      const pixelsPerSecond = [0, 70, 110, 155, 205][autoScrollSpeed] || 110;
      window.scrollBy(0, pixelsPerSecond * elapsed / 1000);
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) void advanceAutoScrollChapter();
      frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
    return () => cancelAnimationFrame(frame);
  }, [autoScroll, autoScrollSpeed, active?.id, active?.current, chapter]);

  async function load(file?: File, encoding: TxtEncoding = "auto") {
    if (!file) return;
    setError("");
    if (!file.name.toLowerCase().endsWith(".txt")) { setError("请选择 TXT 格式的小说文件。"); return; }
    try {
      setStage(`正在读取 ${formatSize(file.size)} 的文档…`);
      if (navigator.storage?.persist) await navigator.storage.persist();
      await new Promise(resolve => setTimeout(resolve, 60));
      const buffer = await file.arrayBuffer();
      setStage("正在识别文字编码…");
      await new Promise(resolve => setTimeout(resolve, 30));
      const text = decodeTxt(buffer, encoding);
      setStage("正在识别章节并整理目录…");
      await new Promise(resolve => setTimeout(resolve, 30));
      const record = parseNovel(text, file.name, file.size);
      setStage(`正在保存 ${record.chapters.length} 个章节到本机…`);
      await saveBook(record);
      const { chapters: _chapters, ...meta } = record;
      setBooks(old => [meta, ...old.filter(book => book.id !== meta.id)]);
      setActive(meta);
      setChapter(record.chapters[0]);
      localStorage.setItem("yejian-active-book", meta.id);
    } catch (reason) {
      console.error(reason);
      setError("处理失败。请确认浏览器有足够的可用存储空间，然后重试。");
    } finally {
      setStage("");
      setPendingFile(null);
      if (input.current) input.current.value = "";
    }
  }

  async function openBook(book: BookMeta) {
    setStage("正在打开上次阅读位置…");
    try {
      const updated = { ...book, at: Date.now() };
      setChapter(await getChapter(book.id, book.current || 0));
      setActive(updated);
      setBooks(old => old.map(item => item.id === updated.id ? updated : item));
      localStorage.setItem("yejian-active-book", updated.id);
      await updateProgress(updated);
    }
    catch { setError("无法读取这本小说，请尝试重新导入。"); }
    finally { setStage(""); }
  }

  async function jump(index: number) {
    if (!active || index < 0 || index >= active.chapterTitles.length) return;
    await stopTts();
    setAutoScroll(false);
    setChapter(await getChapter(active.id, index));
    const updated = { ...active, current: index, scroll: 0, at: Date.now() };
    setActive(updated);
    setBooks(old => old.map(book => book.id === updated.id ? updated : book));
    updateProgress(updated).catch(console.error);
    setToc(false);
    scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleBookmark() {
    if (!active) return;
    const current = active.current || 0;
    const exists = (active.bookmarks || []).includes(current);
    const bookmarks = exists ? (active.bookmarks || []).filter(index => index !== current) : [...(active.bookmarks || []), current].sort((a, b) => a - b);
    const updated = { ...active, bookmarks };
    setActive(updated);
    setBooks(old => old.map(book => book.id === updated.id ? updated : book));
    localStorage.setItem("yejian-active-book", updated.id);
    await updateProgress(updated);
    setNotice(exists ? "已取消书签" : "已添加书签");
  }

  async function addNote(quoteOverride?: string, askForNote = true) {
    if (!active) return;
    const quote = quoteOverride || window.getSelection()?.toString().trim() || "";
    if (!quote) { window.alert("请先在正文中选中一段文字，再点击“摘录”。"); return; }
    const text = askForNote ? (window.prompt("为这段摘录添加笔记（可以留空）", "") ?? "") : "";
    const note: Note = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, chapter: active.current || 0, quote: quote.slice(0, 500), text: text.trim(), createdAt: Date.now() };
    const updated = { ...active, notes: [note, ...(active.notes || [])] };
    setActive(updated);
    setBooks(old => old.map(book => book.id === updated.id ? updated : book));
    await updateProgress(updated);
    window.getSelection()?.removeAllRanges();
    setSelectionMenu(null);
    setNotice(askForNote ? "摘录和笔记已保存" : "文字已标记");
  }

  function openSelectionMenu(event: ReactMouseEvent<HTMLElement>) {
    const quote = window.getSelection()?.toString().trim() || "";
    if (!quote) { setSelectionMenu(null); return; }
    event.preventDefault();
    setSelectionMenu({ x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 120), quote: quote.slice(0, 500) });
  }

  async function removeNote(noteId: string) {
    if (!active) return;
    const updated = { ...active, notes: (active.notes || []).filter(note => note.id !== noteId) };
    setActive(updated);
    setBooks(old => old.map(book => book.id === updated.id ? updated : book));
    await updateProgress(updated);
  }

  async function openNote(note: Note) {
    await jump(note.chapter);
    setNotesOpen(false);
  }

  async function renameManaged() {
    if (!manage) return;
    const title = window.prompt("输入新的书名", manage.title)?.trim();
    if (!title) return;
    const updated = { ...manage, title };
    await updateProgress(updated);
    setBooks(old => old.map(book => book.id === updated.id ? updated : book));
    setManage(updated);
    setNotice("书名已修改");
  }

  function prepareExport(book: BookMeta) {
    setManage(null);
    setExportBook(book);
    setExportStart(1);
    setExportEnd(book.chapterTitles.length);
    setExportMode("separate");
    setExportGroupSize(20);
  }

  async function startExport() {
    if (!exportBook) return;
    const start = Math.max(1, Math.min(exportStart, exportBook.chapterTitles.length));
    const end = Math.max(start, Math.min(exportEnd, exportBook.chapterTitles.length));
    const total = end - start + 1;
    if (IS_NATIVE_APP) {
      await startNativeExport(exportBook, start, end, total);
      return;
    }
    const pickerWindow = window as Window & { showDirectoryPicker?: () => Promise<ExportDirectoryHandle> };
    if (!pickerWindow.showDirectoryPicker) { setError("当前浏览器不支持文件夹导出，请使用最新版 Chrome 或 Edge。"); return; }
    try {
      const root = await pickerWindow.showDirectoryPicker();
      const book = exportBook;
      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const modeLabel = exportMode === "separate" ? "每章一个 TXT" : exportMode === "merged" ? "合并为一个 TXT" : `每 ${exportGroupSize} 章一个 TXT`;
      setExportJobs(old => [{ id: jobId, title: book.title, detail: `第 ${start}–${end} 章 · ${modeLabel}`, current: 0, total, status: "running" }, ...old]);
      setExportBook(null);

      const updateJob = (patch: Partial<ExportJob>) => setExportJobs(old => old.map(job => job.id === jobId ? { ...job, ...patch } : job));
      const writeText = async (directory: ExportDirectoryHandle, name: string, text: string) => {
        const file = await directory.getFileHandle(`${safeFileName(name)}.txt`, { create: true });
        const writable = await file.createWritable();
        await writable.write(`\uFEFF${text}`);
        await writable.close();
      };

      void (async () => {
        try {
          const baseName = safeFileName(book.title);
          const rangeSuffix = start === 1 && end === book.chapterTitles.length ? "" : `-第${start}-${end}章`;
          if (exportMode === "merged") {
            const sections: string[] = [];
            for (let chapterNumber = start; chapterNumber <= end; chapterNumber++) {
              const index = chapterNumber - 1;
              const chapter = await getChapter(book.id, index);
              const title = chapterFileName(chapter.title, index);
              sections.push(`${title}\r\n\r\n${chapter.content.replace(/\n/g, "\r\n")}`);
              updateJob({ current: chapterNumber - start + 1 });
            }
            await writeText(root, `${baseName}${rangeSuffix}`, sections.join("\r\n\r\n\r\n"));
          } else {
            let folderName = `${baseName}${rangeSuffix}`;
            try { await root.getDirectoryHandle(folderName); folderName += `-${new Date().toTimeString().slice(0, 8).replace(/:/g, "")}`; } catch { /* unused name */ }
            const folder = await root.getDirectoryHandle(folderName, { create: true });
            if (exportMode === "separate") {
              const usedNames = new Set<string>();
              for (let chapterNumber = start; chapterNumber <= end; chapterNumber++) {
                const index = chapterNumber - 1;
                const chapter = await getChapter(book.id, index);
                let title = safeFileName(chapterFileName(chapter.title, index));
                if (usedNames.has(title)) title += `-${chapterNumber}`;
                usedNames.add(title);
                await writeText(folder, title, `${chapterFileName(chapter.title, index)}\r\n\r\n${chapter.content.replace(/\n/g, "\r\n")}`);
                updateJob({ current: chapterNumber - start + 1 });
              }
            } else {
              const groupSize = Math.max(1, exportGroupSize);
              for (let groupStart = start; groupStart <= end; groupStart += groupSize) {
                const groupEnd = Math.min(end, groupStart + groupSize - 1);
                const sections: string[] = [];
                for (let chapterNumber = groupStart; chapterNumber <= groupEnd; chapterNumber++) {
                  const index = chapterNumber - 1;
                  const chapter = await getChapter(book.id, index);
                  sections.push(`${chapterFileName(chapter.title, index)}\r\n\r\n${chapter.content.replace(/\n/g, "\r\n")}`);
                  updateJob({ current: chapterNumber - start + 1 });
                }
                await writeText(folder, `第${groupStart}-${groupEnd}章`, sections.join("\r\n\r\n\r\n"));
              }
            }
          }
          updateJob({ current: total, status: "done" });
        } catch (reason) {
          updateJob({ status: "error", error: (reason as Error)?.message || "写入失败" });
        }
      })();
    } catch (reason) {
      if ((reason as { name?: string })?.name !== "AbortError") setError("无法开始导出，请确认所选文件夹可以写入。");
    }
  }

  async function startNativeExport(book: BookMeta, start: number, end: number, total: number) {
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const modeLabel = exportMode === "separate" ? "每章一个 TXT" : exportMode === "merged" ? "合并为一个 TXT" : `每 ${exportGroupSize} 章一个 TXT`;
    setExportJobs(old => [{ id: jobId, title: book.title, detail: `第 ${start}–${end} 章 · ${modeLabel}`, current: 0, total, status: "running" }, ...old]);
    setExportBook(null);
    const updateJob = (patch: Partial<ExportJob>) => setExportJobs(old => old.map(job => job.id === jobId ? { ...job, ...patch } : job));
    const baseName = safeFileName(book.title);
    const rangeSuffix = start === 1 && end === book.chapterTitles.length ? "" : `-第${start}-${end}章`;
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const writeText = async (path: string, content: string) => Filesystem.writeFile({
      path,
      data: `\uFEFF${content}`,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    });

    void (async () => {
      try {
        if (exportMode === "merged") {
          const sections: string[] = [];
          for (let chapterNumber = start; chapterNumber <= end; chapterNumber++) {
            const index = chapterNumber - 1;
            const item = await getChapter(book.id, index);
            sections.push(`${chapterFileName(item.title, index)}\r\n\r\n${item.content.replace(/\n/g, "\r\n")}`);
            updateJob({ current: chapterNumber - start + 1 });
          }
          await writeText(`${MOBILE_EXPORT_ROOT}/${baseName}${rangeSuffix}-${stamp}.txt`, sections.join("\r\n\r\n\r\n"));
        } else {
          const folder = `${MOBILE_EXPORT_ROOT}/${baseName}${rangeSuffix}-${stamp}`;
          if (exportMode === "separate") {
            const usedNames = new Set<string>();
            for (let chapterNumber = start; chapterNumber <= end; chapterNumber++) {
              const index = chapterNumber - 1;
              const item = await getChapter(book.id, index);
              let title = safeFileName(chapterFileName(item.title, index));
              if (usedNames.has(title)) title += `-${chapterNumber}`;
              usedNames.add(title);
              await writeText(`${folder}/${title}.txt`, `${chapterFileName(item.title, index)}\r\n\r\n${item.content.replace(/\n/g, "\r\n")}`);
              updateJob({ current: chapterNumber - start + 1 });
            }
          } else {
            const groupSize = Math.max(1, exportGroupSize);
            for (let groupStart = start; groupStart <= end; groupStart += groupSize) {
              const groupEnd = Math.min(end, groupStart + groupSize - 1);
              const sections: string[] = [];
              for (let chapterNumber = groupStart; chapterNumber <= groupEnd; chapterNumber++) {
                const index = chapterNumber - 1;
                const item = await getChapter(book.id, index);
                sections.push(`${chapterFileName(item.title, index)}\r\n\r\n${item.content.replace(/\n/g, "\r\n")}`);
                updateJob({ current: chapterNumber - start + 1 });
              }
              await writeText(`${folder}/第${groupStart}-${groupEnd}章.txt`, sections.join("\r\n\r\n\r\n"));
            }
          }
        }
        updateJob({ current: total, status: "done" });
        setNotice(`已导出到手机 Documents/${MOBILE_EXPORT_ROOT}`);
      } catch (reason) {
        updateJob({ status: "error", error: (reason as Error)?.message || "写入失败" });
      }
    })();
  }

  async function removeManaged() {
    if (!manage || !window.confirm(`确定从书架删除《${manage.title}》吗？\n原始 TXT 文件不会被删除。`)) return;
    await deleteBook(manage);
    setBooks(old => old.filter(book => book.id !== manage.id));
    setManage(null);
    setNotice("已从书架删除");
  }

  async function searchLibrary() {
    const word = query.trim();
    if (!word) return;
    setSearching(true);
    const found: SearchHit[] = [];
    const searchBooks = searchBookId === "all" ? books : books.filter(book => book.id === searchBookId);
    outer: for (const book of searchBooks) {
      for (let index = 0; index < book.chapterTitles.length; index++) {
        const item = await getChapter(book.id, index);
        const at = item.content.toLowerCase().indexOf(word.toLowerCase());
        if (at >= 0) found.push({ book, chapterIndex: index, chapterTitle: item.title, excerpt: item.content.slice(Math.max(0, at - 35), at + word.length + 55).replace(/\s+/g, " ") });
        if (found.length >= 100) break outer;
      }
    }
    setHits(found);
    setSearching(false);
  }

  async function openHit(hit: SearchHit) {
    const updated = { ...hit.book, current: hit.chapterIndex, scroll: 0, at: Date.now() };
    setChapter(await getChapter(hit.book.id, hit.chapterIndex));
    setActive(updated);
    setBooks(old => old.map(book => book.id === updated.id ? updated : book));
    localStorage.setItem("yejian-active-book", updated.id);
    await updateProgress(updated);
    setSearchOpen(false);
  }

  async function downloadBackup() {
    try {
      setStage("正在整理书架备份…");
      const backup = await exportLibrary();
      if (IS_NATIVE_APP) {
        const name = `页间书架备份-${new Date().toISOString().slice(0, 10)}.json`;
        await Filesystem.writeFile({ path: `${MOBILE_EXPORT_ROOT}/${name}`, data: JSON.stringify(backup), directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
        setNotice(`已备份 ${backup.books.length} 本书到手机 Documents/${MOBILE_EXPORT_ROOT}`);
        return;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `页间书架备份-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(`已备份 ${backup.books.length} 本书`);
    } catch { setError("备份失败，请稍后重试。"); }
    finally { setStage(""); }
  }

  async function uploadBackup(file?: File) {
    if (!file || !window.confirm("恢复备份将替换当前书架，建议先导出当前书架。是否继续？")) return;
    try {
      setStage("正在恢复书架…");
      const backup = JSON.parse(await file.text()) as BackupFile;
      await restoreLibrary(backup);
      setBooks(await getBooks());
      localStorage.removeItem("yejian-active-book");
      setNotice(`已恢复 ${backup.books.length} 本书`);
    } catch { setError("无法恢复：这不是有效的页间备份文件。"); }
    finally { setStage(""); if (backupInput.current) backupInput.current.value = ""; }
  }

  const sortedBooks = [...books].sort((a, b) => {
    if (sortMode === "title") return a.title.localeCompare(b.title, "zh-CN");
    if (sortMode === "progress") return readPercent(b) - readPercent(a);
    if (sortMode === "time") return (b.readSeconds || 0) - (a.readSeconds || 0);
    if (sortMode === "imported") return (b.createdAt ?? b.at) - (a.createdAt ?? a.at);
    return b.at - a.at;
  });

  const totalReadSeconds = books.reduce((sum, book) => sum + (book.readSeconds || 0), 0);
  const totalBookmarks = books.reduce((sum, book) => sum + (book.bookmarks?.length || 0), 0);
  const totalNotes = books.reduce((sum, book) => sum + (book.notes?.length || 0), 0);

  if (active && chapter) return <main className={`reader ${theme}`} onClick={() => selectionMenu && setSelectionMenu(null)}>
    <header>
      <button className="readerBack" onClick={() => { void stopTts(); setAutoScroll(false); localStorage.removeItem("yejian-active-book"); setActive(null); setChapter(null); window.scrollTo({ top: 0 }); }}>←</button>
      <div className="readerTitle"><b>{active.title}</b><small>{chapter.title} · 全书 {readPercent(active)}%</small></div>
      <div className="readerActions">
        <button className="tocTrigger" onClick={() => setToc(true)} aria-label="打开章节目录"><span>☰</span> 目录</button>
        <button className={(active.bookmarks || []).includes(active.current || 0) ? "marked bookmarkAction" : "bookmarkAction"} onClick={toggleBookmark} title="为当前章节添加书签">{(active.bookmarks || []).includes(active.current || 0) ? "★" : "☆"} 书签</button>
        <button className="ttsToggle" onClick={toggleTts} title={ttsStatus === "playing" ? "暂停听书" : "开始听书"}>{ttsStatus === "playing" ? "Ⅱ" : "▶"} 听书</button>
        <button className={autoScroll ? "autoScrollToggle on" : "autoScrollToggle"} onClick={() => void toggleAutoScroll()} title="自动阅读（自动滚屏）">⇣ 自动</button>
        <button className="notesAction" onClick={() => setNotesOpen(true)} title="查看书签与笔记">✎ 笔记</button>
        <button className="fontAction" onClick={() => setSettingsOpen(true)}>Aa 字号</button>
      </div>
    </header>
    <div className="readingProgress"><i style={{ width: `${readPercent(active)}%` }} /></div>
    {ttsStatus !== "idle" && <div className="ttsBar"><div className="ttsMain"><button onClick={toggleTts}>{ttsStatus === "playing" ? "Ⅱ 暂停" : "▶ 继续"}</button><label>语速 <input type="range" min="0.3" max="4" step="0.1" value={ttsRate} onChange={event => selectTtsRate(+event.target.value)} onPointerUp={() => void applyTtsRate()} /><b>{ttsRate.toFixed(1)}×</b></label><button onClick={() => void stopTts()}>■ 停止</button></div><div className="ttsRates">{[0.5, 1, 1.5, 2, 3, 4].map(rate => <button className={ttsRate === rate ? "on" : ""} onClick={() => void applyTtsRate(rate)} key={rate}>{rate}×</button>)}</div><div className="ttsOptions"><button className={ttsPickStart ? "on" : ""} onClick={() => setTtsPickStart(value => !value)}>{ttsPickStart ? "点击正文段落" : "选择起点"}</button><label className="autoRead"><input type="checkbox" checked={ttsAutoRead} onChange={event => setTtsAutoRead(event.target.checked)} /> 连续朗读下一章</label><label>定时 <select value={ttsDeadline ? "active" : "0"} onChange={event => setSleepTimer(+event.target.value)}><option value="0">关闭</option>{ttsDeadline && <option value="active" disabled>{Math.ceil(ttsRemaining / 60)} 分钟后停止</option>}<option value="15">15 分钟</option><option value="30">30 分钟</option><option value="60">60 分钟</option><option value="90">90 分钟</option></select></label>{ttsDeadline && <b className="ttsCountdown">{String(Math.floor(ttsRemaining / 60)).padStart(2, "0")}:{String(ttsRemaining % 60).padStart(2, "0")}</b>}</div></div>}
    {autoScroll && <div className="autoScrollBar"><b>⇣ 自动阅读</b><div className="autoSpeedChoices" aria-label="滚动速度">{["慢速", "标准", "较快", "快速"].map((label, index) => <button className={autoScrollSpeed === index + 1 ? "on" : ""} onClick={() => setAutoScrollSpeed(index + 1)} key={label}>{label}</button>)}</div><button onClick={() => setAutoScroll(false)}>Ⅱ 暂停</button></div>}
    {error && <p role="alert" style={{ padding: 12 }}>{error}</p>}
    <TtsDiagnostics stop={stopTts} lastError={error} />
    {notice && <p role="status" style={{ padding: 12 }}>{notice}</p>}
    <article className={ttsPickStart ? "pickTtsStart" : ""} onContextMenu={openSelectionMenu} style={{ fontSize: settings.font, lineHeight: settings.lineHeight, maxWidth: settings.width, fontFamily: settings.family === "serif" ? "var(--serif)" : settings.family === "kai" ? "KaiTi, STKaiti, serif" : "Arial, Microsoft YaHei, sans-serif" }}>
      <i>{String(active.current + 1).padStart(2, "0")}</i><h1>{chapter.title}</h1>
      {chapter.content.split(/\n+/).filter(Boolean).map((p, i) => <p className={ttsActiveParagraph === i ? "ttsReading" : ""} data-tts-paragraph={i} key={i} onClick={() => ttsPickStart && void startTtsAtParagraph(i)}>{renderMarkedText(p, (active.notes || []).filter(note => note.chapter === (active.current || 0)))}</p>)}
      <footer>
        <button disabled={!active.current} onClick={() => jump(active.current - 1)}>← 上一章</button>
        <span>{active.current + 1} / {active.chapterTitles.length}</span>
        <button disabled={active.current === active.chapterTitles.length - 1} onClick={() => jump(active.current + 1)}>下一章 →</button>
      </footer>
    </article>
    {selectionMenu && <div className="selectionMenu" style={{ left: selectionMenu.x, top: selectionMenu.y }} onClick={e => e.stopPropagation()}><small>已选择 {selectionMenu.quote.length} 个字</small><button onClick={() => addNote(selectionMenu.quote, false)}>标记摘录</button><button onClick={() => addNote(selectionMenu.quote, true)}>添加笔记</button></div>}
    {toc && <aside className="tocPanel"><button className="close" onClick={() => setToc(false)} aria-label="关闭目录">×</button><em>CONTENTS</em><h2>{active.title}</h2><small className="tocHint">共 {active.chapterTitles.length} 章 · 已读 {readPercent(active)}%</small><div className="tocList">{active.chapterTitles.map((title, i) => <button className={i === active.current ? "on" : ""} onClick={() => jump(i)} key={i}><span>{String(i + 1).padStart(2, "0")}</span>{title}</button>)}</div></aside>}
    {settingsOpen && <div className="modalShade" onClick={() => setSettingsOpen(false)}><section className="settingsPanel" onClick={e => e.stopPropagation()}><button className="modalClose" onClick={() => setSettingsOpen(false)}>×</button><em>READING SETTINGS</em><h2>阅读设置</h2><label>字号 <b>{settings.font}px</b><input type="range" min="16" max="30" value={settings.font} onChange={e => setSettings({ ...settings, font: +e.target.value })} /></label><label>行距 <b>{settings.lineHeight.toFixed(1)}</b><input type="range" min="1.5" max="2.8" step="0.1" value={settings.lineHeight} onChange={e => setSettings({ ...settings, lineHeight: +e.target.value })} /></label><label>页面宽度 <b>{settings.width}px</b><input type="range" min="560" max="900" step="20" value={settings.width} onChange={e => setSettings({ ...settings, width: +e.target.value })} /></label><div className="choiceRow"><button className={settings.family === "serif" ? "on" : ""} onClick={() => setSettings({ ...settings, family: "serif" })}>宋体</button><button className={settings.family === "kai" ? "on" : ""} onClick={() => setSettings({ ...settings, family: "kai" })}>楷体</button><button className={settings.family === "sans" ? "on" : ""} onClick={() => setSettings({ ...settings, family: "sans" })}>黑体</button></div><div className="choiceRow"><button onClick={() => setTheme("paper")}>米白</button><button onClick={() => setTheme("green")}>护眼</button><button onClick={() => setTheme("night")}>夜间</button></div></section></div>}
    {notesOpen && <div className="modalShade" onClick={() => setNotesOpen(false)}><section className="notesPanel" onClick={e => e.stopPropagation()}><button className="modalClose" onClick={() => setNotesOpen(false)}>×</button><em>BOOKMARKS & NOTES</em><h2>书签与笔记</h2><h3>章节书签</h3><div className="bookmarkList">{(active.bookmarks || []).map(index => <button onClick={() => jump(index)} key={index}><span>★</span>{active.chapterTitles[index]}</button>)}{!(active.bookmarks || []).length && <p>还没有书签，阅读时点击顶部的 ☆ 即可添加。</p>}</div><h3>文字摘录</h3><div className="noteList">{(active.notes || []).map(note => <article key={note.id}><button className="noteOpen" onClick={() => openNote(note)}><small>{active.chapterTitles[note.chapter]}</small><blockquote>{note.quote}</blockquote>{note.text && <p>{note.text}</p>}</button><button className="noteDelete" onClick={() => removeNote(note.id)}>删除</button></article>)}{!(active.notes || []).length && <p>选中正文中的文字，再点击顶部“摘录”。</p>}</div></section></div>}
    {!!exportJobs.length && <aside className="exportJobs"><header><b>导出任务</b><button onClick={() => setExportJobs(old => old.filter(job => job.status === "running"))}>清除已完成</button></header>{exportJobs.map(job => <article key={job.id} className={job.status}><div><b>{job.title}</b><span>{job.status === "running" ? `${job.current} / ${job.total}` : job.status === "done" ? "已完成" : "失败"}</span></div><small>{job.detail}</small><div className="jobProgress"><i style={{ width: `${Math.round(job.current / job.total * 100)}%` }} /></div>{job.error && <p>{job.error}</p>}</article>)}</aside>}
  </main>;

  return <main>
    <nav><a><span>页</span><b>页间</b></a><div>我的书架　　使用帮助</div><button className="navText" onClick={() => setSearchOpen(true)}>⌕ 全书搜索</button>{!IS_NATIVE_APP && <button className="installButton" onClick={installApp}>{installed ? "✓ 已安装" : "▣ 安装到桌面"}</button>}<button onClick={() => input.current?.click()}>＋ 导入小说</button></nav>
    <section className="hero"><div><em>YOUR PRIVATE READING ROOM</em><h1>让每一段文字，<br />都有舒展的空间。</h1><p>导入 TXT，自动整理章节。没有广告，没有打扰，<br />只留下你和故事。</p><button onClick={() => input.current?.click()}>导入一本小说　→</button><small>支持千万字大文件 · 完全本地 · 无需上传</small></div><figure><div className="sun" /><div className="book a">THE QUIET<br />CHAPTER</div><div className="book b">页间 · 私人书房</div><div className="cup" /></figure></section>
    <section className="shelf"><div className="shelfTitle"><div><em>MY LIBRARY</em><h2>我的书架 <small>{books.length}</small></h2></div><div className="shelfTools"><select value={sortMode} onChange={e => setSortMode(e.target.value)} aria-label="书架排序"><option value="recent">最近阅读</option><option value="imported">最近导入</option><option value="title">按书名</option><option value="progress">按进度</option><option value="time">按阅读时长</option></select><button onClick={() => setStatsOpen(true)}>阅读统计</button><button onClick={downloadBackup}>导出备份</button><button onClick={() => backupInput.current?.click()}>恢复备份</button></div></div>{error && <div className="importError">{error}</div>}{notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}<div className="grid"><button className="add" onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); setPendingFile(e.dataTransfer.files[0]); }}><b>＋</b><strong>添加新故事</strong><span>支持千万字 TXT<br />可选择文字编码</span></button>{sortedBooks.map((book, i) => <div className="bookItem" key={book.id}><button className="card" onClick={() => openBook(book)}><div className={`cover c${i % 4}`}><small>长篇小说</small><strong>{book.title.slice(0, 8)}</strong><i>◌</i><em>{(book.bookmarks?.length || 0) + (book.notes?.length || 0) ? `${book.bookmarks?.length || 0} 书签 · ${book.notes?.length || 0} 笔记` : "私人藏书"}</em></div><h3>{book.title}</h3><p>{book.chapterTitles.length} 章 · 已读 {readPercent(book)}% · {formatDuration(book.readSeconds)}</p><div className="cardProgress"><i style={{ width: `${readPercent(book)}%` }} /></div></button><button className="moreButton" onClick={() => setManage(book)} aria-label={`管理${book.title}`}>•••</button></div>)}</div></section>
    <section className="steps"><em>LARGE FILE READY</em><h2>大文件也能安静地留在本机</h2><div>{[["01", "本地读取", "文件不经过服务器，没有上传大小限制"], ["02", "分章存储", "正文存入大容量本地数据库，不再挤占书架空间"], ["03", "按章加载", "阅读时只取当前章节，千万字也能流畅翻阅"]].map(item => <article key={item[0]}><b>{item[0]}</b><h3>{item[1]}</h3><p>{item[2]}</p></article>)}</div></section>
    <input ref={input} type="file" accept=".txt,text/plain" hidden onChange={e => setPendingFile(e.target.files?.[0] || null)} />
    <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={e => uploadBackup(e.target.files?.[0])} />
    {pendingFile && <div className="modalShade" onClick={() => setPendingFile(null)}><section className="encodingPanel" onClick={e => e.stopPropagation()}><button className="modalClose" onClick={() => setPendingFile(null)}>×</button><em>TEXT ENCODING</em><h2>选择文字编码</h2><p>{pendingFile.name} · {formatSize(pendingFile.size)}</p><button onClick={() => load(pendingFile, "auto")}><b>自动识别</b><span>推荐：优先 UTF-8，其次 GB18030</span></button><button onClick={() => load(pendingFile, "utf-8")}><b>UTF-8</b><span>网络下载和新文件最常见</span></button><button onClick={() => load(pendingFile, "gb18030")}><b>GBK / GB18030</b><span>大陆旧版 TXT 最常见</span></button><button onClick={() => load(pendingFile, "big5")}><b>Big5</b><span>繁体中文旧版 TXT</span></button><small>如果导入后出现乱码，请删除该书并重新导入，改选另一种编码。</small></section></div>}
    {manage && <div className="modalShade" onClick={() => setManage(null)}><section className="managePanel" onClick={e => e.stopPropagation()}><button className="modalClose" onClick={() => setManage(null)}>×</button><em>BOOK MANAGEMENT</em><h2>{manage.title}</h2><p>{manage.chapterTitles.length} 章 · {formatSize(manage.size)} · 已读 {readPercent(manage)}%</p><button onClick={renameManaged}>修改书名</button><button onClick={() => prepareExport(manage)}>导出章节…</button><button className="danger" onClick={removeManaged}>从书架删除</button></section></div>}
    {exportBook && <div className="modalShade" onClick={() => setExportBook(null)}><section className="exportPanel" onClick={e => e.stopPropagation()}><button className="modalClose" onClick={() => setExportBook(null)}>×</button><em>CHAPTER EXPORT</em><h2>导出《{exportBook.title}》</h2><p>全书共 {exportBook.chapterTitles.length} 章</p><div className="rangeFields"><label>从第<input type="number" min="1" max={exportBook.chapterTitles.length} value={exportStart} onChange={e => setExportStart(+e.target.value)} />章</label><span>—</span><label>到第<input type="number" min="1" max={exportBook.chapterTitles.length} value={exportEnd} onChange={e => setExportEnd(+e.target.value)} />章</label></div><h3>导出方式</h3><div className="exportModes"><button className={exportMode === "separate" ? "on" : ""} onClick={() => setExportMode("separate")}><b>每章一个 TXT</b><span>适合单独整理章节</span></button><button className={exportMode === "merged" ? "on" : ""} onClick={() => setExportMode("merged")}><b>合并为一个 TXT</b><span>将所选章节合并</span></button><button className={exportMode === "grouped" ? "on" : ""} onClick={() => setExportMode("grouped")}><b>分组导出</b><span>每若干章合并一个文件</span></button></div>{exportMode === "grouped" && <label className="groupSize">每 <input type="number" min="1" max="500" value={exportGroupSize} onChange={e => setExportGroupSize(+e.target.value)} /> 章生成一个 TXT</label>}<div className="exportSummary">将导出第 {Math.max(1, exportStart)}–{Math.min(exportEnd, exportBook.chapterTitles.length)} 章，共 {Math.max(0, Math.min(exportEnd, exportBook.chapterTitles.length) - Math.max(1, exportStart) + 1)} 章</div><button className="startExport" onClick={startExport}>{IS_NATIVE_APP ? "导出到手机 Documents" : "选择保存位置并开始后台导出"}</button><small>开始后可继续阅读，或为其他小说启动新的导出任务。</small></section></div>}
    {searchOpen && <div className="modalShade" onClick={() => setSearchOpen(false)}><section className="searchPanel" onClick={e => e.stopPropagation()}><button className="modalClose" onClick={() => setSearchOpen(false)}>×</button><em>FULL TEXT SEARCH</em><h2>全文搜索</h2><label className="searchScope"><span>搜索范围</span><select value={searchBookId} onChange={e => { setSearchBookId(e.target.value); setHits([]); }}><option value="all">全部书籍（{books.length} 本）</option>{books.map(book => <option value={book.id} key={book.id}>{book.title}</option>)}</select></label><div className="searchBox"><input autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && searchLibrary()} placeholder="输入人物、地点或句子" /><button onClick={searchLibrary}>搜索</button></div><small>{searchBookId === "all" ? "搜索整个书架" : `仅搜索《${books.find(book => book.id === searchBookId)?.title || "所选书籍"}》`}，最多显示 100 条结果</small><div className="searchResults">{searching ? <p>正在逐章搜索…</p> : hits.map((hit, i) => <button key={`${hit.book.id}-${hit.chapterIndex}-${i}`} onClick={() => openHit(hit)}><b>{hit.book.title}</b><span>{hit.chapterTitle}</span><p>…{hit.excerpt}…</p></button>)}{!searching && query && !hits.length && <p>没有找到相关内容</p>}</div></section></div>}
    {statsOpen && <div className="modalShade" onClick={() => setStatsOpen(false)}><section className="statsPanel" onClick={e => e.stopPropagation()}><button className="modalClose" onClick={() => setStatsOpen(false)}>×</button><em>READING STATISTICS</em><h2>阅读统计</h2><div className="statsGrid"><article><b>{books.length}</b><span>书架藏书</span></article><article><b>{formatDuration(totalReadSeconds)}</b><span>累计阅读</span></article><article><b>{totalBookmarks}</b><span>章节书签</span></article><article><b>{totalNotes}</b><span>文字笔记</span></article></div><h3>每本书的阅读时间</h3><div className="bookStats">{[...books].sort((a, b) => (b.readSeconds || 0) - (a.readSeconds || 0)).map(book => <p key={book.id}><span>{book.title}</span><b>{formatDuration(book.readSeconds)}</b></p>)}</div></section></div>}
    {!!exportJobs.length && <aside className="exportJobs"><header><b>导出任务</b><button onClick={() => setExportJobs(old => old.filter(job => job.status === "running"))}>清除已完成</button></header>{exportJobs.map(job => <article key={job.id} className={job.status}><div><b>{job.title}</b><span>{job.status === "running" ? `${job.current} / ${job.total}` : job.status === "done" ? "已完成" : "失败"}</span></div><small>{job.detail}</small><div className="jobProgress"><i style={{ width: `${Math.round(job.current / job.total * 100)}%` }} /></div>{job.error && <p>{job.error}</p>}</article>)}</aside>}
    {stage && <div className="processing" role="status"><div className="processingMark">页</div><h3>正在整理你的故事</h3><p>{stage}</p><div className="processingBar"><i /></div><small>大文件可能需要几十秒，请不要关闭页面</small></div>}
  </main>;
}
