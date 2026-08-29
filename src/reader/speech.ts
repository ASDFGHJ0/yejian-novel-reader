import type { Chapter, SpeechPart } from "./types";

function speechChunks(text: string, maxLength = 420) {
  const sentences = text.replace(/\s+/g, " ").match(/[^。！？!?；;]+[。！？!?；;]?/g) || [text];
  const chunks: string[] = [];
  let current = "";
  sentences.forEach(sentence => {
    if (current && current.length + sentence.length > maxLength) {
      chunks.push(current.trim());
      current = "";
    }
    if (sentence.length > maxLength) {
      for (let index = 0; index < sentence.length; index += maxLength) chunks.push(sentence.slice(index, index + maxLength).trim());
    } else current += sentence;
  });
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

export function chapterSpeechParts(chapter: Chapter, startParagraph = 0, includeTitle = true): SpeechPart[] {
  const parts: SpeechPart[] = [];
  if (includeTitle) speechChunks(chapter.title).forEach(text => parts.push({ text, paragraph: -1 }));
  chapter.content.split(/\n+/).filter(Boolean).slice(startParagraph).forEach((paragraph, offset) => {
    speechChunks(paragraph).forEach(text => parts.push({ text, paragraph: startParagraph + offset }));
  });
  return parts;
}
