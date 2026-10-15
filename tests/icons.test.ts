import assert from "node:assert/strict";
import test from "node:test";
import { parseIcon, parseIconSys, shapeWeights } from "../src/icons/parser";

import { model } from "./icon-helper";
test("icon geometry and stored keyframe weights use correct offsets and non-uniform timing", () => {
  const icon = parseIcon(model());
  assert.equal(icon.shapes[0]![0], 1);
  assert.equal(icon.shapes[1]![0], 2);
  assert.equal(icon.normals[2], 1);
  assert.equal(icon.colors[1], 0.5);
  assert.deepEqual(icon.tracks[0]!.keys[0], { time: 0, value: 1 });
  assert.deepEqual(icon.tracks[1]!.keys[0], { time: 0, value: 0 });
  assert.deepEqual(shapeWeights(icon, 0), [1, 0]);
  assert.deepEqual(shapeWeights(icon, 3), [0, 1]);
  assert.deepEqual(shapeWeights(icon, 1.5), [0.5625, 0.4375]);
  assert.deepEqual(shapeWeights(icon, 15), [0, 1]);
  assert.deepEqual(shapeWeights(icon, 6), [0.4, 0.6000000000000001]);
});
test("a key at the boundary after the header's last frame ends the cycle", () => {
  const bytes = model();
  const view = new DataView(bytes.buffer);
  view.setUint32(120, 11, true);
  const icon = parseIcon(bytes);
  assert.equal(icon.duration, 12);
  assert.deepEqual(shapeWeights(icon, 12), shapeWeights(icon, 0));
  view.setFloat32(224, 13, true);
  assert.throws(() => parseIcon(bytes), /keyframe/);
  view.setFloat32(224, 12, true);
  view.setFloat32(144, NaN, true);
  assert.throws(() => parseIcon(bytes), /animation/);
});
test("bounded RLE produces exactly 128 by 128 pixels", () => {
  const icon = parseIcon(model(true));
  assert.equal(icon.texture!.length, 65536);
  assert.deepEqual(icon.texture!.slice(0, 4), new Uint8Array([248, 0, 0, 255]));
  for (const count of [0, 16383, 16385]) {
    const bytes = model(true);
    new DataView(bytes.buffer).setUint16(236, count, true);
    assert.throws(() => parseIcon(bytes), /texture/);
  }
});
test("a leading key at -1 interpolates at zero without an inserted pose", () => {
  const bytes = model(true), view = new DataView(bytes.buffer);
  view.setFloat32(144, -1, true);
  view.setFloat32(184, -1, true);
  const original = bytes.slice(), icon = parseIcon(bytes);
  assert.deepEqual(icon.tracks[0]!.keys[0], { time: -1, value: 1 });
  assert.equal(icon.tracks[0]!.keys.length, 4);
  assert.deepEqual(shapeWeights(icon, 0), [0.875, 0.125]);
  assert.deepEqual(shapeWeights(icon, 0.5), [0.8125, 0.1875]);
  assert.deepEqual(shapeWeights(icon, 12), shapeWeights(icon, 0));
  assert.equal(icon.texture!.length, 65536);
  assert.deepEqual(bytes, original);
  for (const time of [-2, NaN, Infinity]) {
    const invalid = original.slice();
    new DataView(invalid.buffer).setFloat32(144, time, true);
    assert.throws(() => parseIcon(invalid), /animation|keyframe/);
  }
  view.setFloat32(152, -1, true);
  assert.throws(() => parseIcon(bytes), /keyframe/);
});
test("icon.sys retains large and negative colour channels with bounded directions", () => {
  const bytes = new Uint8Array(964), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("PS2D"));
  for (const at of [128, 144, 160, 176]) {
    view.setFloat32(at, 255, true);
    view.setFloat32(at + 4, 128, true);
    view.setFloat32(at + 8, -0.5, true);
  }
  const original = bytes.slice(), sys = parseIconSys(bytes);
  assert.deepEqual(sys.ambient, [255, 128, -0.5]);
  assert.deepEqual(sys.lightColors, Array.from({ length: 3 }, () => [255, 128, -0.5]));
  assert.deepEqual(bytes, original);
  for (const at of [128, 144, 160, 176])
    for (const value of [256, -256, NaN, Infinity]) {
      const invalid = original.slice();
      new DataView(invalid.buffer).setFloat32(at, value, true);
      assert.throws(() => parseIconSys(invalid), /lighting/);
    }
  view.setFloat32(80, 101, true);
  assert.throws(() => parseIconSys(bytes), /lighting/);
});
test("malformed icon counts, offsets, non-finite animation, invalid shape IDs and truncated textures fail", () => {
  for (const length of [0, 4, 19, 115, 135, 151, 231, 237])
    assert.throws(() => parseIcon(model(true).slice(0, length)));
  for (const [offset, value] of [
    [4, 0xffffffff],
    [16, 9999999],
    [132, 2000],
    [136, 2],
    [140, 0],
    [236, 0xffffffff],
  ]) {
    const bytes = model(true);
    new DataView(bytes.buffer).setUint32(offset!, value!, true);
    assert.throws(() => parseIcon(bytes));
  }
  const bytes = model();
  new DataView(bytes.buffer).setFloat32(124, NaN, true);
  assert.throws(() => parseIcon(bytes), /animation/);
});
test("icon.sys title split is a byte offset, trims NUL and preserves icon filename case", () => {
  const bytes = new Uint8Array(964);
  bytes.set(new TextEncoder().encode("PS2D"));
  new DataView(bytes.buffer).setUint16(6, 2, true);
  bytes.set([0x82, 0xa0, 0x82, 0xa2, 0], 192);
  bytes.set(new TextEncoder().encode("ICON.ICN"), 260);
  bytes.set(new TextEncoder().encode("COPY.ICN"), 324);
  bytes.set(new TextEncoder().encode("DELETE.ICN"), 388);
  assert.equal(parseIconSys(bytes).title, "あ い");
  assert.equal(parseIconSys(bytes).normal, "ICON.ICN");
  assert.equal(parseIconSys(bytes).copy, "COPY.ICN");
  assert.equal(parseIconSys(bytes).delete, "DELETE.ICN");
  const view = new DataView(bytes.buffer);
  view.setUint32(12, 64, true);
  view.setUint32(16, 20, true);
  view.setUint32(20, 70, true);
  view.setUint32(24, 90, true);
  assert.equal(parseIconSys(bytes).backgroundOpacity, 64);
  assert.deepEqual(parseIconSys(bytes).backgroundColors[0], [20, 70, 90]);
  view.setUint32(12, 129, true);
  assert.throws(() => parseIconSys(bytes), /background/);
  view.setUint32(12, 64, true);
  view.setUint32(16, 256, true);
  assert.throws(() => parseIconSys(bytes), /background/);
  bytes[0] = 0;
  assert.throws(() => parseIconSys(bytes));
});

test('zero-keyframe static tracks leave the following texture aligned', async () => {
  const { staticModel } = await import('./icon-helper');
  const bytes = staticModel(), icon = parseIcon(bytes);
  assert.equal(icon.shapes.length, 1);
  assert.equal(icon.shapes[0]!.length, 9);
  assert.deepEqual(shapeWeights(icon, 0), [1]);
  assert.deepEqual(shapeWeights(icon, 100), [1]);
  assert.equal(icon.texture!.length, 65536);
  assert.deepEqual(icon.texture!.slice(-4), new Uint8Array([248, 0, 0, 255]));
  for (const length of [115, 119, 123, 127]) assert.throws(() => parseIcon(bytes.slice(0, length)), /Truncated/);
  const invalid = bytes.slice(); new DataView(invalid.buffer).setUint32(112, 1, true);
  assert.throws(() => parseIcon(invalid), /track/);
  // A compact empty track can also precede another track with keys.
  const animated = model(true), mixed = new Uint8Array(animated.length - 32);
  mixed.set(animated.subarray(0, 144)); mixed.set(animated.subarray(176), 144);
  new DataView(mixed.buffer).setUint32(140, 0, true);
  const parsed = parseIcon(mixed);
  assert.equal(parsed.tracks[1]!.keys.length, 6);
  assert.equal(parsed.texture!.length, 65536);
});

test('a single-shape icon can carry Burnout 3\'s unused shape ID 1 track', async () => {
  const { staticModel } = await import('./icon-helper');
  const original = staticModel();
  const bytes = new Uint8Array(original.length + 8);
  bytes.set(original.subarray(0, 120));
  bytes.set(original.subarray(120), 128);
  const view = new DataView(bytes.buffer);
  view.setUint32(112, 1, true);
  view.setUint32(116, 1, true);
  const icon = parseIcon(bytes);
  assert.deepEqual(shapeWeights(icon, 0), [1]);
  assert.equal(icon.texture!.length, 65536);
  view.setUint32(112, 2, true);
  assert.throws(() => parseIcon(bytes), /track/);
});
