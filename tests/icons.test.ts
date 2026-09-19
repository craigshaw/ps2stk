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
  assert.deepEqual(shapeWeights(icon, 0), [1, 0]);
  assert.deepEqual(shapeWeights(icon, 3), [0, 1]);
  assert.deepEqual(shapeWeights(icon, 1.5), [0.5, 0.5]);
  assert.deepEqual(shapeWeights(icon, 15), [0, 1]);
  assert.deepEqual(shapeWeights(icon, 6), [0.4, 0.6000000000000001]);
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
  assert.equal(parseIconSys(bytes).title, "あ い");
  assert.equal(parseIconSys(bytes).normal, "ICON.ICN");
  bytes[0] = 0;
  assert.throws(() => parseIconSys(bytes));
});
