import type { BackupFile, BookMeta, BookRecord, Chapter } from "./types";

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("yejian-library", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("books")) db.createObjectStore("books", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chapters")) db.createObjectStore("chapters", { keyPath: ["bookId", "index"] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveBook(record: BookRecord) {
  const db = await openLibrary();
  const tx = db.transaction(["books", "chapters"], "readwrite");
  const { chapters, ...meta } = record;
  tx.objectStore("books").put(meta);
  chapters.forEach((chapter, index) => tx.objectStore("chapters").put({ bookId: record.id, index, ...chapter }));
  await done(tx);
  db.close();
}

export async function getBooks(): Promise<BookMeta[]> {
  const db = await openLibrary();
  const result = await new Promise<BookMeta[]>((resolve, reject) => {
    const request = db.transaction("books").objectStore("books").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result.sort((a, b) => b.at - a.at);
}

export async function getChapter(bookId: string, index: number): Promise<Chapter> {
  const db = await openLibrary();
  const result = await new Promise<Chapter>((resolve, reject) => {
    const request = db.transaction("chapters").objectStore("chapters").get([bookId, index]);
    request.onsuccess = () => resolve(request.result || { title: "正文", content: "本章暂无内容。" });
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

export async function updateProgress(book: BookMeta) {
  const db = await openLibrary();
  const tx = db.transaction("books", "readwrite");
  tx.objectStore("books").put(book);
  await done(tx);
  db.close();
}

export async function deleteBook(book: BookMeta) {
  const db = await openLibrary();
  const tx = db.transaction(["books", "chapters"], "readwrite");
  tx.objectStore("books").delete(book.id);
  book.chapterTitles.forEach((_, index) => tx.objectStore("chapters").delete([book.id, index]));
  await done(tx);
  db.close();
}

export async function exportLibrary(): Promise<BackupFile> {
  const books = await getBooks();
  const records = await Promise.all(books.map(async book => ({ ...book, chapters: await Promise.all(book.chapterTitles.map((_, index) => getChapter(book.id, index))) })));
  return { format: "yejian-library", version: 1, exportedAt: new Date().toISOString(), books: records };
}

export async function restoreLibrary(backup: BackupFile) {
  if (backup.format !== "yejian-library" || backup.version !== 1 || !Array.isArray(backup.books)) throw new Error("invalid backup");
  const db = await openLibrary();
  const tx = db.transaction(["books", "chapters"], "readwrite");
  tx.objectStore("books").clear();
  tx.objectStore("chapters").clear();
  backup.books.forEach(record => {
    const { chapters, ...meta } = record;
    tx.objectStore("books").put(meta);
    chapters.forEach((chapter, index) => tx.objectStore("chapters").put({ bookId: record.id, index, ...chapter }));
  });
  await done(tx);
  db.close();
}
