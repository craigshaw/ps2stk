import type { CardEntry, MemoryCard } from "../core/index";
import { parseIconSys } from "../icons/parser";
import type { IconSys } from "../icons/parser";
export const bytesLabel = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1048576).toFixed(2)} MiB`;
export const flattenFiles = (entry: CardEntry): CardEntry[] =>
  entry.kind === "file" ? [entry] : entry.children.flatMap(flattenFiles);
export const fileBytes = (entry: CardEntry): number =>
  flattenFiles(entry).reduce((sum, file) => sum + file.length, 0);
export function cardDate(value: readonly number[]): string {
  const [, second, minute, hour, day, month, lo, hi] = value;
  const year = (lo ?? 0) + (hi ?? 0) * 256;
  if (!year || !month || !day) return "Not recorded";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}
export interface SaveInfo {
  entry: CardEntry;
  title: string;
  sys: IconSys | null;
  iconPath: string | null;
  issue: string | null;
}
export function saveInfo(card: MemoryCard, entry: CardEntry): SaveInfo {
  let sys: IconSys | null = null;
  try {
    const config = entry.children.find(
      (e) => e.kind === "file" && e.name.toLowerCase() === "icon.sys",
    );
    if (!config) throw new Error("No icon.sys.");
    sys = parseIconSys(card.readFile(config.path));
    const icon =
      entry.children.find((e) => e.kind === "file" && e.name === sys!.normal) ??
      entry.children.find(
        (e) =>
          e.kind === "file" &&
          e.name.toLowerCase() === sys!.normal.toLowerCase(),
      );
    if (!icon) throw new Error("The icon model is missing.");
    return {
      entry,
      title: sys.title || entry.name,
      sys,
      iconPath: icon.path,
      issue: null,
    };
  } catch (error) {
    return {
      entry,
      title: sys?.title || entry.name,
      sys,
      iconPath: null,
      issue: error instanceof Error ? error.message : "Preview unavailable.",
    };
  }
}
