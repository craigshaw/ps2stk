// Hand-authored layout, independent of the parser: one triangle, two morph
// shapes, two non-uniform weight tracks, and an optional RLE texture.
export function model(texture = false): Uint8Array {
  const data = new Uint8Array(232 + (texture ? 8 : 0)),
    dv = new DataView(data.buffer);
  const u = (at: number, n: number) => dv.setUint32(at, n, true);
  const f = (at: number, n: number) => dv.setFloat32(at, n, true);
  u(0, 65536);
  u(4, 2);
  u(8, texture ? 15 : 3);
  f(12, 1);
  u(16, 3);
  for (let vertex = 0; vertex < 3; vertex++) {
    const at = 20 + vertex * 32;
    dv.setInt16(at, 4096, true);
    dv.setInt16(at + 8, 8192, true);
    dv.setInt16(at + 20, 4096, true);
    data.set([128, 64, 32, 128], at + 28);
  }
  u(116, 1);
  u(120, 12);
  f(124, 1);
  u(128, 0);
  u(132, 2);
  // Track 0 has four stored keys, starting at the first pair.
  u(136, 0);
  u(140, 4);
  f(144, 0);
  f(148, 1);
  f(152, 1);
  f(156, 0.75);
  f(160, 3);
  f(164, 0);
  f(168, 12);
  f(172, 1);
  u(176, 1);
  u(180, 6);
  for (const [i, [time, value]] of [
    [1, 0.25],
    [3, 1],
    [6, 0.5],
    [9, 0.25],
    [12, 0],
  ].entries()) {
    f(192 + i * 8, time!);
    f(196 + i * 8, value!);
  }
  f(184, 0);
  f(188, 0);
  if (texture) {
    u(232, 4);
    dv.setUint16(236, 16384, true);
    dv.setUint16(238, 31, true);
  }
  return data;
}

import { MemoryCard } from "../src/core/index";
import { SaveContent } from "../src/core/index";
import type { SaveNode } from "../src/core/index";
import { makeRecord } from "../src/core/save";
import { fixture, raw } from "./helpers";
/** Entirely synthetic card and preview assets, kept out of the application. */
export function animatedCard(): Uint8Array {
  const bytes = fixture(),
    records = raw(bytes);
  for (const [from, to] of [
    ["bytes-0", "icon.sys"],
    ["bytes-513", "icon.ico"],
  ] as const) {
    const at = records.entry(`/SAVE-A/${from}`) + 64;
    bytes.fill(0, at, at + 32);
    bytes.set(new TextEncoder().encode(to), at);
  }
  const sys = new Uint8Array(964),
    sysView = new DataView(sys.buffer);
  sys.set(new TextEncoder().encode("PS2D"));
  sys.set(new TextEncoder().encode("Synthetic animated icon"), 192);
  sys.set(new TextEncoder().encode("icon.ico"), 260);
  sysView.setUint32(12, 64, true);
  for (const [corner, rgb] of [[10, 20, 30], [40, 50, 60], [70, 80, 90], [100, 110, 120]].entries())
    rgb.forEach((value, channel) => sysView.setUint32(16 + corner * 16 + channel * 4, value, true));
  for (const at of [176, 180, 184]) sysView.setFloat32(at, 1, true);
  const icon = model(),
    view = new DataView(icon.buffer);
  for (let vertex = 0; vertex < 3; vertex++)
    for (let shape = 0; shape < 2; shape++) {
      const at = 20 + vertex * 32 + shape * 8;
      view.setInt16(at, vertex === 0 ? -4096 : vertex === 1 ? 4096 : 0, true);
      view.setInt16(at + 2, vertex === 2 ? 4096 : -4096, true);
      view.setInt16(at + 4, shape === 1 ? 4096 : 0, true);
    }
  return new MemoryCard(bytes)
    .replaceFile("/SAVE-A/icon.sys", sys)
    .replaceFile("/SAVE-A/icon.ico", icon)
    .export();
}

/** Synthetic save with three icon.sys roles and optional duplicate model files. */
export function iconGalleryCard(roles: "distinct" | "identical" | "shared" = "distinct"): Uint8Array {
  const sys = new Uint8Array(964);
  const view = new DataView(sys.buffer);
  sys.set(new TextEncoder().encode("PS2D"));
  sys.set(new TextEncoder().encode("Synthetic icon gallery"), 192);
  for (const [offset, name] of [[260, "icon.ico"], [324, roles === "shared" ? "icon.ico" : "copy.ico"], [388, roles === "shared" ? "icon.ico" : "del.ico"]] as const)
    sys.set(new TextEncoder().encode(name), offset);
  for (const at of [176, 180, 184]) view.setFloat32(at, 1, true);
  const iconBytes = (index: number) => {
    const bytes = model();
    const iconView = new DataView(bytes.buffer);
    for (let vertex = 0; vertex < 3; vertex++) {
      for (let shape = 0; shape < 2; shape++) {
        const at = 20 + vertex * 32 + shape * 8;
        iconView.setInt16(at, vertex === 0 ? -4096 : vertex === 1 ? 4096 : 0, true);
        iconView.setInt16(at + 2, vertex === 2 ? 4096 : -4096, true);
        iconView.setInt16(at + 4, shape === 1 ? 4096 : 0, true);
      }
      bytes[20 + vertex * 32 + 28] = 32 + index * 32;
    }
    return bytes;
  };
  const file = (name: string, bytes: Uint8Array): SaveNode => {
    const record = makeRecord(name, false);
    new DataView(record.buffer).setUint32(4, bytes.length, true);
    return { kind: "file" as const, record, bytes };
  };
  const children: SaveNode[] = [
    file("icon.sys", sys),
    ...["icon.ico", ...(roles === "shared" ? [] : ["copy.ico", "del.ico"])].map((name, index) =>
      file(name, iconBytes(roles === "identical" ? 0 : index))),
  ];
  if (roles === "distinct") {
    const extraDirectory = makeRecord("BONUS", true);
    new DataView(extraDirectory.buffer).setUint32(4, 3, true);
    children.push({
      kind: "directory",
      record: extraDirectory,
      dot: makeRecord(".", true),
      dotdot: makeRecord("..", true),
      children: [file("extra.ico", iconBytes(3))],
    });
  }
  const record = makeRecord("SAVE-ICONS", true);
  new DataView(record.buffer).setUint32(4, children.length + 2, true);
  const save = new SaveContent({
    kind: "directory",
    record,
    dot: makeRecord(".", true),
    dotdot: makeRecord("..", true),
    children,
  });
  return MemoryCard.create().importSave(save).export();
}

/** One textured triangle with a zero-key static track and no reserved pair. */
export function staticModel(): Uint8Array {
  const bytes = new Uint8Array(128), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x10000, true);
  view.setUint32(4, 1, true);
  view.setUint32(8, 12, true);
  view.setFloat32(12, 1, true);
  view.setUint32(16, 3, true);
  for (let vertex = 0; vertex < 3; vertex++) {
    const at = 20 + vertex * 24;
    view.setInt16(at, vertex === 0 ? -4096 : vertex === 1 ? 4096 : 0, true);
    view.setInt16(at + 2, vertex === 2 ? 4096 : -4096, true);
    view.setInt16(at + 12, 4096, true);
    bytes.set([128, 128, 128, 128], at + 20);
  }
  view.setUint32(92, 1, true); // animation header
  view.setUint32(96, 1, true); // duration
  view.setFloat32(100, 1, true);
  view.setUint32(108, 1, true); // one track: shape 0, zero keys
  view.setUint32(120, 4, true); // texture immediately after the 8-byte track
  view.setUint16(124, 16384, true);
  view.setUint16(126, 31, true);
  return bytes;
}
