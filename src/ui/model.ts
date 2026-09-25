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
  icons: IconChoice[];
  issue: string | null;
}
export interface IconChoice {
  label: string;
  filename: string;
  path: string | null;
}
export function saveInfo(card: Pick<MemoryCard, "readFile">, entry: CardEntry): SaveInfo {
  let sys: IconSys | null = null;
  try {
    const config = entry.children.find(
      (e) => e.kind === "file" && e.name.toLowerCase() === "icon.sys",
    );
    if (!config) throw new Error("No icon.sys.");
    sys = parseIconSys(card.readFile(config.path));
    const files = entry.children.filter((e) => e.kind === "file");
    const find = (name: string) =>
      files.find((e) => e.name === name) ??
      files.find((e) => e.name.toLowerCase() === name.toLowerCase());
    const icons: IconChoice[] = ([
      ["Normal", sys.normal],
      ["Copy", sys.copy],
      ["Delete", sys.delete],
    ] as const)
      .filter(([, name]) => !!name)
      .map(([label, filename]) => ({ label, filename, path: find(filename)?.path ?? null }));
    const referenced = new Set(icons.map((icon) => icon.path));
    for (const file of flattenFiles(entry)) {
      if (/\.(ico|icn)$/i.test(file.name) && !referenced.has(file.path))
        icons.push({ label: "Other", filename: file.path.slice(entry.path.length + 1), path: file.path });
    }
    const iconPath = icons.find((icon) => icon.label === "Normal")?.path ?? null;
    return {
      entry,
      title: sys.title || entry.name,
      sys,
      iconPath,
      icons,
      issue: iconPath ? null : "The normal icon model is missing.",
    };
  } catch (error) {
    return {
      entry,
      title: sys?.title || entry.name,
      sys,
      iconPath: null,
      icons: [],
      issue: error instanceof Error ? error.message : "Preview unavailable.",
    };
  }
}
