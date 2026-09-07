"use client";
import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { TextToSpeech } from "@capacitor-community/text-to-speech";

export default function TtsDiagnostics({ stop, lastError }: { stop: () => Promise<void>; lastError: string }) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);
  async function inspect() {
    setBusy(true);
    try {
      const native = Capacitor.isNativePlatform();
      const details = native
        ? { chinese: await TextToSpeech.isLanguageSupported({ lang: "zh-CN" }), voices: await TextToSpeech.getSupportedVoices() }
        : { supported: "speechSynthesis" in window, voices: window.speechSynthesis?.getVoices().map(v => ({ name: v.name, lang: v.lang })) };
      setReport(JSON.stringify({ platform: Capacitor.getPlatform(), lastError, details, note: "当前接口不能读取媒体音量或系统默认引擎名称；请在系统设置中查看。报告不包含小说正文。" }, null, 2));
    } catch (reason) { setReport(String(reason)); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true);
    try {
      await stop();
      setReport("已请求朗读：页间听书测试。请确认是否实际听到声音。");
      if (Capacitor.isNativePlatform()) await TextToSpeech.speak({ text: "页间听书测试。", lang: "zh-CN", rate: 1, pitch: 1, volume: 1 });
      else {
        const utterance = new SpeechSynthesisUtterance("页间听书测试。");
        utterance.lang = "zh-CN";
        await new Promise<void>((resolve, reject) => {
          utterance.onend = () => resolve();
          utterance.onerror = e => reject(new Error(e.error));
          window.speechSynthesis.speak(utterance);
        });
      }
      setReport("语音引擎报告朗读完成。是否实际发声仍以你听到的结果为准。");
    } catch (reason) { setReport("测试失败：" + String(reason)); }
    finally { setBusy(false); }
  }
  return <div style={{ padding: 12 }}>
    <button onClick={() => setOpen(!open)}>听书诊断</button>
    {open && <section aria-label="听书诊断" style={{ padding: 16, border: "1px solid", borderRadius: 8 }}>
      <p>先查看语音支持情况，再测试一句。测试会停止当前听书。</p>
      <button disabled={busy} onClick={inspect}>检查语音</button>{" "}
      <button disabled={busy} onClick={test}>测试朗读</button>{" "}
      <button onClick={() => { void stop(); setBusy(false); }}>停止测试</button>{" "}
      <button onClick={() => setOpen(false)}>关闭</button>
      {lastError && <p role="alert">最近错误：{lastError}</p>}
      <textarea aria-label="诊断结果，可选择复制" readOnly value={report} rows={8} style={{ width: "100%", marginTop: 12, color: "#263a32", background: "#fff" }} />
      <button onClick={() => navigator.clipboard.writeText(report).catch(() => setReport(report + "\n复制失败，请长按上方文本手动复制。"))}>复制诊断</button>
    </section>}
  </div>;
}
