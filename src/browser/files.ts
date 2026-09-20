import { MAX_PACKAGE_BYTES } from '../formats/psu';
import type { CardEntry, MemoryCard } from "../core/index";

export async function readCardFile(file: File): Promise<Uint8Array> {
  if (file.size !== 8388608 && file.size !== 8650752)
    throw new Error(
      "Open a standard 8 MiB PS2 memory card image, with or without ECC spare bytes.",
    );
  return new Uint8Array(await file.arrayBuffer());
}
export async function readReplacement(file: File): Promise<Uint8Array> {
  if (file.size > 8388608)
    throw new Error("The replacement file exceeds the card capacity.");
  return new Uint8Array(await file.arrayBuffer());
}
export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
// A narrow interface keeps folder-write logic independently testable.
export interface DumpFileHandle {
  createWritable(): Promise<{
    write(bytes: Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}
export interface DumpDirectory {
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<DumpDirectory>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<DumpFileHandle>;
}
export type FolderPicker = (options: {
  mode: "readwrite";
}) => Promise<DumpDirectory>;
export function folderPicker(): FolderPicker | undefined {
  return (
    window as unknown as { showDirectoryPicker?: FolderPicker }
  ).showDirectoryPicker?.bind(window);
}
export function safeSegment(name: string): void {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    /[\x00-\x1f\x7f<>:"/\\|?*]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  ) {
    throw new Error(
      `Cannot dump the unsafe or unsupported name: ${JSON.stringify(name)}.`,
    );
  }
}
export interface DumpPlan {
  name: string;
  directories: string[][];
  files: { parts: string[]; bytes: Uint8Array }[];
}
export function planDump(card: Pick<MemoryCard, "readFile">, save: CardEntry): DumpPlan {
  if (save.kind !== "directory")
    throw new Error("Select a complete save to dump.");
  safeSegment(save.name);
  const result: DumpPlan = { name: save.name, directories: [], files: [] };
  const visit = (entries: readonly CardEntry[], path: string[]) => {
    const names = new Set<string>();
    for (const entry of entries) {
      safeSegment(entry.name);
      const key = entry.name.normalize("NFC").toLowerCase();
      if (names.has(key))
        throw new Error(
          "Names in this save collide on a case-insensitive file system. Dump its files individually.",
        );
      names.add(key);
      const parts = [...path, entry.name];
      if (entry.kind === "directory") {
        result.directories.push(parts);
        visit(entry.children, parts);
      } else result.files.push({ parts, bytes: card.readFile(entry.path) });
    }
  };
  visit(save.children, []);
  return result;
}
function missing(error: unknown): boolean {
  return error instanceof Error && error.name === "NotFoundError";
}
export class FolderDumpError extends Error {
  constructor(
    readonly completed: number,
    readonly total: number,
    readonly started: boolean,
    cause: unknown,
  ) {
    super(
      `Folder dump stopped: ${completed} of ${total} files completed. ${started ? "The output folder may contain partial files. " : "No files were written. "}${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}
export async function writeDump(
  parent: DumpDirectory,
  plan: DumpPlan,
): Promise<number> {
  let completed = 0,
    started = false;
  try {
    // Require a fresh save folder. Never merge with or overwrite an existing dump.
    try {
      await parent.getDirectoryHandle(plan.name);
      throw new Error(
        `A folder named ${plan.name} already exists. Choose another destination folder.`,
      );
    } catch (error) {
      if (!missing(error)) throw error;
    }
    const root = await parent.getDirectoryHandle(plan.name, { create: true });
    started = true;
    const dirs = new Map<string, DumpDirectory>([["", root]]);
    for (const parts of plan.directories) {
      const parentDir = dirs.get(parts.slice(0, -1).join("/"))!;
      dirs.set(
        parts.join("/"),
        await parentDir.getDirectoryHandle(parts.at(-1)!, { create: true }),
      );
    }
    for (const file of plan.files) {
      const dir = dirs.get(file.parts.slice(0, -1).join("/"))!,
        name = file.parts.at(-1)!;
      try {
        await dir.getFileHandle(name);
        throw new Error(`The file ${file.parts.join("/")} already exists.`);
      } catch (error) {
        if (!missing(error)) throw error;
      }
      const handle = await dir.getFileHandle(name, { create: true });
      const stream = await handle.createWritable();
      try {
        await stream.write(file.bytes);
        await stream.close();
        completed++;
      } catch (error) {
        try {
          await stream.abort();
        } catch {
          /* Preserve the original failure. */
        }
        throw error;
      }
    }
    return completed;
  } catch (error) {
    throw new FolderDumpError(completed, plan.files.length, started, error);
  }
}

export async function readSavePackage(file: File): Promise<Uint8Array> {
  if (file.size > MAX_PACKAGE_BYTES) throw new Error('Save package exceeds the 16 MiB input limit.');
  return new Uint8Array(await file.arrayBuffer());
}
