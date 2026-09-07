import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

async function source(file) {
  const text = fs.readFileSync(new URL("../src/reader/" + file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } });
  return import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
}
const novel = await source("novel.tsx");
const speech = await source("speech.ts");
test("TXT BOM 和换行：识别章节并保留正文", () => {
  const book = novel.parseNovel("\ufeff第一章 出发\r\n正文甲\r\n第二章 回家\r\n正文乙", "故事.txt", 100);
  assert.equal(book.title, "故事");
  assert.deepEqual(book.chapters.map(c => c.content), ["正文甲", "正文乙"]);
});
test("无标题长文本：分段不丢字", () => {
  const text = "甲".repeat(120001);
  assert.equal(novel.parseNovel(text, "大书", text.length).chapters.map(c => c.content).join(""), text);
});
test("自动解码支持 UTF8 和 GBK 中文", () => {
  assert.equal(novel.decodeTxt(new TextEncoder().encode("中文").buffer, "auto"), "中文");
  assert.equal(novel.decodeTxt(Uint8Array.from([0xd6,0xd0,0xce,0xc4]).buffer, "auto"), "中文");
});
test("导出章节名称和 Windows 不合法字符", () => {
  assert.equal(novel.chapterFileName("正文", 2), "第三章");
  assert.equal(novel.chapterFileName("第三章 大侠出游", 2), "第三章：大侠出游");
  assert.equal(novel.safeFileName('书/名?.'), "书_名_");
});
test("听书逐句切分并保留段落位置", () => {
  assert.deepEqual(speech.chapterSpeechParts({title:"标题",content:"甲。乙！\n丙？"}, 1, false), [{text:"丙？",paragraph:1}]);
  assert.equal(speech.chapterSpeechParts({title:"",content:"甲。乙！丙？"},0,false).length,3);
});
test("缓存升级不删除其他项目缓存", async () => {
  const handlers = {};
  const deleted = [];
  const context = { self: { addEventListener: (name, callback) => handlers[name] = callback, clients: { claim: async () => {} } }, caches: { keys: async () => ["other-project", "yejian-app-v1", "yejian-app-v0.4.0"], delete: async key => deleted.push(key) } };
  vm.runInNewContext(fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), context);
  let done;
  handlers.activate({waitUntil: promise => done = promise});
  await done;
  assert.deepEqual(deleted, ["yejian-app-v1"]);
});
