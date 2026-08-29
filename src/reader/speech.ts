import type { Chapter, SpeechPart } from "./types";

function speechChunks(text: string, maxLength = 180) {
  const sentences = text.replace(/\s+/g, " ").match(/[^。！？!?；;]+[。！？!?；;]?/g) || [text];
  return sentences.flatMap(sentence => {
    const clean = sentence.trim();
    if (clean.length <= maxLength) return clean ? [clean] : [];
    const chunks: string[] = [];
    for (let index = 0; index < clean.length; index += maxLength) chunks.push(clean.slice(index, index + maxLength));
    return chunks;
  });
}

export function chapterSpeechParts(chapter: Chapter, startParagraph = 0, includeTitle = true): SpeechPart[] {
  const parts: SpeechPart[] = [];
  if (includeTitle) speechChunks(chapter.title).forEach(text => parts.push({ text, paragraph: -1 }));
  chapter.content.split(/\n+/).filter(Boolean).slice(startParagraph).forEach((paragraph, offset) => {
    speechChunks(paragraph).forEach(text => parts.push({ text, paragraph: startParagraph + offset }));
  });
  return parts;
}
