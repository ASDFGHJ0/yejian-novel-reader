import type { BookMeta, BookRecord, Chapter, Note, TxtEncoding } from "./types";

export const DEMO: BookRecord = {
  id: "demo", title: "山茶文具店", at: 0, createdAt: 0, current: 0, size: 420, scroll: 0,
  chapterTitles: ["第一章 风从海上来", "第二章 未寄出的信"],
  chapters: [
    { title: "第一章 风从海上来", content: "四月的风从海上来，穿过长长的石板路，吹动檐下那枚旧铜铃。\n\n我推开文具店的木门时，阳光恰好落在柜台上。尘埃在光柱里缓缓浮游，像许多尚未写下的字。\n\n桌角放着一封没有寄出的信。信封是柔软的米白色，收信人的名字被认真地写了三遍，又轻轻划去。\n\n有些话，在心里住得太久，就会变成一座安静的岛。写信的人需要做的，不过是搭一座通往那里的桥。" },
    { title: "第二章 未寄出的信", content: "第二天清晨，门缝里多了一只浅蓝色信封。\n\n没有邮票，也没有地址，只有一句很小的话：请替我写一封告别信。" },
  ],
};

export function parseNovel(text: string, name: string, bytes: number): BookRecord {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  const heading = /^\s*((?:第[0-9零一二三四五六七八九十百千万两〇]+[章节卷回篇部]|序章|楔子|引子|前言|后记|尾声|番外(?:\d+)?|Chapter\s*\d+)[^\n]{0,30})\s*$/gim;
  const matches = [...clean.matchAll(heading)];
  let chapters: Chapter[];
  if (matches.length) {
    chapters = matches.map((match, index) => {
      const start = (match.index || 0) + match[0].length;
      const end = index + 1 < matches.length ? (matches[index + 1].index || clean.length) : clean.length;
      return { title: match[1].trim(), content: clean.slice(start, end).trim() || "本章暂无内容。" };
    });
  } else {
    const chunkSize = 60000;
    chapters = [];
    for (let start = 0, index = 0; start < clean.length; start += chunkSize, index++) {
      chapters.push({ title: clean.length > chunkSize ? `第 ${index + 1} 节` : "正文", content: clean.slice(start, start + chunkSize) });
    }
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = Date.now();
  return { id, title: name.replace(/\.txt$/i, ""), at: createdAt, createdAt, current: 0, size: bytes, scroll: 0, chapterTitles: chapters.map(c => c.title), chapters };
}

export function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function readPercent(book: BookMeta) {
  return Math.round(((book.current || 0) + 1) / Math.max(1, book.chapterTitles.length) * 100);
}

export function formatDuration(seconds = 0) {
  if (seconds < 60) return "不足 1 分钟";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}

export function renderMarkedText(text: string, notes: Note[]) {
  const matches = notes.map(note => note.quote.trim()).filter(quote => quote && text.includes(quote)).sort((a, b) => b.length - a.length);
  if (!matches.length) return text;
  const quote = matches[0];
  const at = text.indexOf(quote);
  return <>{text.slice(0, at)}<mark>{quote}</mark>{text.slice(at + quote.length)}</>;
}

export function decodeTxt(buffer: ArrayBuffer, encoding: TxtEncoding) {
  if (encoding !== "auto") return new TextDecoder(encoding).decode(buffer);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { return new TextDecoder("gb18030").decode(buffer); }
}

export function safeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").trim().slice(0, 100) || "未命名";
}

function chineseNumber(value: number) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const units = ["", "十", "百", "千"];
  if (value <= 0) return digits[0];
  const chars = String(value).split("").map(Number);
  let result = "";
  chars.forEach((digit, index) => {
    const unit = chars.length - index - 1;
    if (digit) result += `${digits[digit]}${units[unit]}`;
    else if (!result.endsWith("零") && chars.slice(index + 1).some(Boolean)) result += "零";
  });
  return result.startsWith("一十") ? result.slice(1) : result;
}

export function chapterFileName(title: string, index: number) {
  if (!title || title === "正文" || /^第\s*\d+\s*节$/.test(title)) return `第${chineseNumber(index + 1)}章`;
  const match = title.trim().match(/^(第[0-9零一二三四五六七八九十百千万两〇]+章)(.*)$/);
  if (!match) return title.trim();
  const subtitle = match[2].replace(/^[\s:：、.。\-—]+/, "").trim();
  return subtitle ? `${match[1]}：${subtitle}` : match[1];
}
