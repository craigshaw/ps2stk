// Adapted from Craig Shaw's ps2mcs icon browser (MIT). See THIRD_PARTY_NOTICES.md.
export interface IconSys {
  title: string;
  normal: string;
  copy: string;
  delete: string;
  lightDirs: number[][];
  lightColors: number[][];
  ambient: number[];
  backgroundOpacity: number;
  backgroundColors: number[][];
}
export interface Track {
  shape: number;
  keys: { time: number; value: number }[];
}
export interface IconModel {
  shapes: Float32Array[];
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  texture: Uint8Array | null;
  tracks: Track[];
  duration: number;
  speed: number;
  offset: number;
}
function valid(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function text(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  return new TextDecoder("shift_jis")
    .decode(end < 0 ? bytes : bytes.subarray(0, end))
    .replace(/\u3000/g, " ")
    .normalize("NFKC")
    .trim();
}
export function parseIconSys(bytes: Uint8Array): IconSys {
  valid(
    bytes.length >= 964 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === "PS2D",
    "Missing or invalid icon.sys.",
  );
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vector = (offset: number) =>
    Array.from({ length: 3 }, (_, i) => {
      const value = dv.getFloat32(offset + i * 4, true);
      valid(
        Number.isFinite(value) && Math.abs(value) <= 100,
        "Invalid icon lighting.",
      );
      return value;
    });
  const titleBytes = bytes.subarray(192, 260),
    split = dv.getUint16(6, true);
  const backgroundOpacity = dv.getUint32(12, true);
  const backgroundColors = Array.from({ length: 4 }, (_, corner) =>
    Array.from({ length: 3 }, (_, channel) =>
      dv.getUint32(16 + corner * 16 + channel * 4, true),
    ),
  );
  valid(
    backgroundOpacity <= 128 &&
      backgroundColors.every((corner) => corner.every((value) => value <= 255)),
    "Invalid icon background.",
  );
  const title =
    split > 0 && split < 68
      ? [text(titleBytes.subarray(0, split)), text(titleBytes.subarray(split))]
          .filter(Boolean)
          .join(" ")
      : text(titleBytes);
  const iconName = (offset: number) => {
    const nameBytes = bytes.subarray(offset, offset + 64);
    const end = nameBytes.indexOf(0);
    return String.fromCharCode(...nameBytes.subarray(0, end < 0 ? 64 : end));
  };
  return {
    title,
    normal: iconName(260),
    copy: iconName(324),
    delete: iconName(388),
    lightDirs: [80, 96, 112].map(vector),
    lightColors: [128, 144, 160].map(vector),
    ambient: vector(176),
    backgroundOpacity,
    backgroundColors,
  };
}
export function parseIcon(bytes: Uint8Array): IconModel {
  valid(
    bytes.length <= 2 * 1024 * 1024,
    "Icon exceeds the preview size limit.",
  );
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  const need = (count: number) =>
    valid(at + count <= bytes.length, "Truncated icon data.");
  const u32 = () => {
    need(4);
    const v = dv.getUint32(at, true);
    at += 4;
    return v;
  };
  const f32 = () => {
    need(4);
    const v = dv.getFloat32(at, true);
    at += 4;
    valid(Number.isFinite(v), "Invalid animation value.");
    return v;
  };
  valid(u32() === 0x10000, "Unsupported icon format.");
  const count = u32(),
    textureType = u32();
  u32();
  const vertices = u32();
  valid(
    count > 0 &&
      count <= 64 &&
      vertices > 0 &&
      vertices <= 65535 &&
      vertices % 3 === 0,
    "Unsupported icon geometry.",
  );
  valid(
    count * vertices <= 1000000,
    "Icon exceeds the preview geometry limit.",
  );
  need(vertices * (count * 8 + 16));
  const shapes = Array.from(
    { length: count },
    () => new Float32Array(vertices * 3),
  );
  const normals = new Float32Array(vertices * 3),
    uvs = new Float32Array(vertices * 2),
    colors = new Float32Array(vertices * 3);
  for (let v = 0; v < vertices; v++) {
    for (const shape of shapes) {
      for (let c = 0; c < 3; c++)
        shape[v * 3 + c] = dv.getInt16(at + c * 2, true) / 4096;
      at += 8;
    }
    for (let c = 0; c < 3; c++)
      normals[v * 3 + c] = dv.getInt16(at + c * 2, true) / 4096;
    at += 8;
    for (let c = 0; c < 2; c++)
      uvs[v * 2 + c] = dv.getInt16(at + c * 2, true) / 4096;
    at += 4;
    for (let c = 0; c < 3; c++) colors[v * 3 + c] = bytes[at + c]! / 128;
    at += 4;
  }
  valid(u32() === 1, "Invalid icon animation header.");
  const duration = u32(),
    speed = f32(),
    offset = u32(),
    trackCount = u32();
  valid(
    duration <= 1000000 && speed >= 0 && speed <= 100 && trackCount <= count,
    "Unsupported icon animation.",
  );
  const tracks: Track[] = [],
    seen = new Set<number>();
  for (let t = 0; t < trackCount; t++) {
    const shape = u32(),
      keyCount = u32();
    valid(
      (shape < count || (count === 1 && shape === 1 && keyCount === 1)) &&
        !seen.has(shape) && keyCount <= 4096,
      "Invalid icon animation track.",
    );
    seen.add(shape);
    need(keyCount * 8);
    // Nonempty tracks include a reserved pair in keyCount. A zero-key
    // static track has no pair: the next track or texture follows immediately.
    if (keyCount > 0) {
      u32();
      u32();
    }
    const keys: Track["keys"] = [];
    for (let k = 1; k < keyCount; k++) {
      const time = f32(),
        value = f32();
      valid(
        time >= 0 &&
          time <= duration &&
          value >= 0 &&
          value <= 1 &&
          (keys.length === 0 || time > keys.at(-1)!.time),
        "Invalid icon keyframe.",
      );
      keys.push({ time, value });
    }
    if (shape === 0 && !keys.some((k) => k.time === 0))
      keys.unshift({ time: 0, value: 1 });
    // Burnout 3 uses shape ID 1 with one shape and no keyframes. The track
    // cannot change geometry, so keep the one stored shape as the fallback.
    if (shape < count) tracks.push({ shape, keys });
  }
  let texture: Uint8Array | null = null;
  if (textureType & 4) {
    const pixels = new Uint16Array(128 * 128);
    if (textureType & 8) {
      const size = u32();
      need(size);
      valid(size % 2 === 0, "Invalid compressed texture size.");
      const end = at + size;
      let pixel = 0;
      while (at < end) {
        const code = dv.getUint16(at, true);
        at += 2;
        const literal = code >= 0xff00,
          run = literal ? 0x10000 - code : code;
        valid(
          run > 0 &&
            pixel + run <= pixels.length &&
            at + (literal ? run * 2 : 2) <= end,
          "Invalid compressed texture run.",
        );
        for (let i = 0; i < run; i++)
          pixels[pixel++] = dv.getUint16(at + (literal ? i * 2 : 0), true);
        at += literal ? run * 2 : 2;
      }
      valid(pixel === pixels.length, "Incomplete icon texture.");
    } else {
      need(pixels.length * 2);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = dv.getUint16(at, true);
        at += 2;
      }
    }
    texture = new Uint8Array(pixels.length * 4);
    pixels.forEach((pixel, i) => {
      texture![i * 4] = (pixel & 31) << 3;
      texture![i * 4 + 1] = ((pixel >> 5) & 31) << 3;
      texture![i * 4 + 2] = ((pixel >> 10) & 31) << 3;
      texture![i * 4 + 3] = 255;
    });
  }
  return {
    shapes,
    normals,
    uvs,
    colors,
    texture,
    tracks,
    duration,
    speed,
    offset,
  };
}
/** Cyclic interpolation of the stored shape weights, not equal-time shape cycling. */
export function shapeWeights(icon: IconModel, frame: number): number[] {
  const weights = icon.shapes.map(() => 0);
  const time = icon.duration
    ? ((frame % icon.duration) + icon.duration) % icon.duration
    : 0;
  for (const track of icon.tracks) {
    const keys = track.keys;
    if (!keys.length) continue;
    if (keys.length === 1 || !icon.duration) {
      weights[track.shape] = keys[0]!.value;
      continue;
    }
    let next = keys.findIndex((k) => k.time > time);
    if (next < 0) next = 0;
    const right = keys[next]!,
      left = keys[(next + keys.length - 1) % keys.length]!;
    const start = left.time > time ? left.time - icon.duration : left.time;
    const end = right.time <= time ? right.time + icon.duration : right.time;
    const fraction = end > start ? (time - start) / (end - start) : 0;
    weights[track.shape] = left.value + (right.value - left.value) * fraction;
  }
  const total = weights.reduce((sum, n) => sum + n, 0);
  if (total <= 0) weights[0] = 1;
  else weights.forEach((n, i) => (weights[i] = n / total));
  return weights;
}
