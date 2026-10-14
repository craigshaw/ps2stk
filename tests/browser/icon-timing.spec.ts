import { expect, test } from "@playwright/test";
import type { IconModel, IconSys } from "../../src/icons/parser";

// Synthetic morphs only. Expected poses are fixed keyframe positions, not
// values calculated with the renderer's elapsed-time conversion.
for (const scenario of [
  { speed: 1, offset: 0, seconds: 1, hz: 60, expectedFrame: 60 },
  { speed: 0.5, offset: 15, seconds: 1, hz: 30, expectedFrame: 45 },
  { speed: 0, offset: 15, seconds: 1, hz: 120, expectedFrame: 15 },
  { speed: 1, offset: 0, seconds: 2, hz: 120, expectedFrame: 0 },
]) {
  test(`icon timing: speed ${scenario.speed}, offset ${scenario.offset}, ${scenario.seconds}s at ${scenario.hz} Hz`, async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async (scenario) => {
      // @ts-expect-error Vite serves this browser module.
      const { mountPreview } = await import("/src/icons/renderer.ts");
      const callbacks = new Map<number, FrameRequestCallback>();
      let id = 0;
      const originalRequest = window.requestAnimationFrame;
      const originalCancel = window.cancelAnimationFrame;
      window.requestAnimationFrame = (callback) => {
        callbacks.set(++id, callback);
        return id;
      };
      window.cancelAnimationFrame = (id) => { callbacks.delete(id); };
      const model: IconModel = {
        shapes: [
          new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
          new Float32Array([-1, -1, 0, 1, -1, 0, 0.75, 0, 0]),
        ],
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        uvs: new Float32Array(6),
        colors: new Float32Array(9).fill(1),
        texture: null,
        tracks: [
          { shape: 0, keys: [{ time: 0, value: 1 }, { time: 60, value: 0 }, { time: 120, value: 1 }] },
          { shape: 1, keys: [{ time: 0, value: 0 }, { time: 60, value: 1 }, { time: 120, value: 0 }] },
        ],
        duration: 120,
        speed: scenario.speed,
        offset: scenario.offset,
      };
      const sys: IconSys = {
        title: "Synthetic timing test", normal: "", copy: "", delete: "",
        lightDirs: [[0, 0, 1], [0, 0, 1], [0, 0, 1]],
        lightColors: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
        ambient: [1, 1, 1], backgroundOpacity: 0, backgroundColors: [],
      };
      const canvases = [document.createElement("canvas"), document.createElement("canvas")];
      for (const canvas of canvases) {
        canvas.style.cssText = "width: 200px; height: 200px";
        document.body.append(canvas);
      }
      const fail = () => { throw new Error("Synthetic preview failed."); };
      const actual = mountPreview(canvases[0]!, model, sys, fail);
      const expected = mountPreview(canvases[1]!, { ...model, speed: 0, offset: scenario.expectedFrame }, sys, fail);
      try {
        actual.animate(true);
        expected.animate(true);
        // First callback establishes the clock. Later callbacks advance it.
        for (let frame = 0; frame <= scenario.seconds * scenario.hz; frame++) {
          const pending = [...callbacks.values()];
          callbacks.clear();
          for (const callback of pending) callback(1000 + frame * 1000 / scenario.hz);
        }
        const pixels = canvases[0]!.getContext("2d")!.getImageData(0, 0, canvases[0]!.width, canvases[0]!.height).data;
        return {
          actual: canvases[0]!.toDataURL(),
          expected: canvases[1]!.toDataURL(),
          visible: pixels.some((value, index) => index % 4 === 3 && value > 0),
        };
      } finally {
        actual.dispose();
        expected.dispose();
        window.requestAnimationFrame = originalRequest;
        window.cancelAnimationFrame = originalCancel;
        canvases.forEach((canvas) => canvas.remove());
      }
    }, scenario);
    expect(result.visible).toBe(true);
    expect(result.actual).toBe(result.expected);
  });
}
