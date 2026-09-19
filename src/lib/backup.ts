import { supabase } from "@/lib/supabaseClient";
import type { Song } from "@/types/song";

const DB_NAME = "komadi-backup";
const STORE_NAME = "handles";
const HANDLE_KEY = "backupDir";

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function storeDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB morda ni na voljo (npr. privaten način) — ni usodno, ob
    // naslednjem kliku bomo uporabnika znova vprašali za mapo.
  }
}

// Poskusi ponovno uporabiti prej izbrano mapo (shranjeno v IndexedDB); če je
// ni ali je dovoljenje preklicano, uporabnika vpraša, naj izbere mapo
// `backups` znotraj projekta.
async function ensureWritableDir(): Promise<FileSystemDirectoryHandle> {
  let handle = await getStoredDirHandle();

  if (handle) {
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") return handle;
    if (perm === "prompt") {
      const granted = await handle.requestPermission({ mode: "readwrite" });
      if (granted === "granted") return handle;
    }
    handle = null;
  }

  const picked = await window.showDirectoryPicker({ id: "komadi-backups", mode: "readwrite" });
  await storeDirHandle(picked);
  return picked;
}

function backupFileName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `songs-${stamp}.json`;
}

async function fetchAllSongs(): Promise<Song[]> {
  const { data, error } = await supabase
    .from("songs")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Song[];
}

async function buildBackupFile(): Promise<{ songs: Song[]; json: string; fileName: string }> {
  const songs = await fetchAllSongs();
  const json = JSON.stringify(songs, null, 2);
  return { songs, json, fileName: backupFileName() };
}

export type BackupResult = { count: number; method: "folder" | "download" | "share" };

// Izvozi vse skladbe v JSON. Če brskalnik podpira File System Access API
// (Chrome/Edge), datoteko zapiše neposredno v izbrano mapo na disku (prvič
// vpraša, nato si mapo zapomni). Sicer se sproži navaden prenos datoteke.
export async function runBackup(): Promise<BackupResult> {
  const { songs, json, fileName } = await buildBackupFile();

  if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
    const dir = await ensureWritableDir();
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
    return { count: songs.length, method: "folder" };
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { count: songs.length, method: "download" };
}

// Deli JSON datoteko prek sistemskega menija za deljenje (Web Share API) —
// na telefonu/Chromu ta meni ponuja tudi "Google Drive" (ali Files/Diski) kot
// eno od tarč. Če naprava/brskalnik deljenja datotek ne podpira (npr.
// Firefox), se datoteka namesto tega prenese kot pri "Shrani backup".
//
// Chromium ima za deljene datoteke strog seznam dovoljenih pripon/MIME
// tipov (.json ni na njem — glej share_service_impl.cc), zato deljeno
// datoteko označimo kot .txt/text-plain; vsebina (veljaven JSON) je enaka.
export async function shareBackup(): Promise<BackupResult> {
  const { songs, json, fileName } = await buildBackupFile();
  const shareFileName = fileName.replace(/\.json$/, ".txt");
  const file = new File([json], shareFileName, { type: "text/plain" });

  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "Komadi – backup skladb" });
    return { count: songs.length, method: "share" };
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { count: songs.length, method: "download" };
}
