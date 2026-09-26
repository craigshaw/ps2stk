import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Box } from "lucide-react";
import type { MemoryCard } from "../core/index";
import { parseIcon } from "../icons/parser";
import type { PreviewHandle } from "../icons/renderer";
import type { SaveInfo } from "./model";

export function IconPreview({
  card,
  info,
  animate,
  view = "detail",
  showBackground = false,
  iconPath = info.iconPath,
  label = "PS2 save icon",
  freeView = false,
  resetViewToken = 0,
  onReadyChange,
}: {
  card: Pick<MemoryCard, "readFile">;
  info: SaveInfo;
  animate: boolean;
  view?: "overview" | "detail";
  showBackground?: boolean;
  iconPath?: string | null;
  label?: string;
  freeView?: boolean;
  resetViewToken?: number;
  onReadyChange?: (ready: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mounted = useRef<PreviewHandle | null>(null);
  const active = useRef(animate);
  active.current = animate;
  const interactive = useRef(freeView);
  interactive.current = freeView;
  const readyChange = useRef(onReadyChange);
  readyChange.current = onReadyChange;
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const colors = info.sys?.backgroundColors;
  const gradient = (left: number[], right: number[]) =>
    `linear-gradient(to right, rgb(${left.join(",")}), rgb(${right.join(",")}))`;
  useEffect(() => {
    const element = canvas.current!;
    let alive = true,
      visible = false,
      generation = 0;
    setFailed(false);
    setReady(false);
    readyChange.current?.(false);
    const observer = new IntersectionObserver(async ([entry]) => {
      visible = !!entry?.isIntersecting;
      const current = ++generation;
      if (!visible) {
        mounted.current?.dispose();
        mounted.current = null;
        return;
      }
      if (mounted.current || !info.sys || !iconPath) return;
      try {
        const { mountPreview } = await import("../icons/renderer");
        if (!alive || !visible || current !== generation) return;
        const model = parseIcon(card.readFile(iconPath));
        mounted.current = mountPreview(element, model, info.sys, () => {
          if (alive) {
            setFailed(true);
            setReady(false);
            readyChange.current?.(false);
            mounted.current?.dispose();
            mounted.current = null;
          }
        }, view);
        mounted.current.setFreeView(interactive.current);
        mounted.current.animate(active.current);
        setReady(true);
        readyChange.current?.(true);
      } catch {
        if (alive) {
          setFailed(true);
          setReady(false);
          readyChange.current?.(false);
        }
      }
    });
    observer.observe(element);
    return () => {
      alive = false;
      observer.disconnect();
      mounted.current?.dispose();
      mounted.current = null;
    };
  }, [card, info, iconPath, view]);
  useEffect(() => mounted.current?.animate(animate), [animate]);
  useEffect(() => mounted.current?.setFreeView(freeView), [freeView]);
  useEffect(() => {
    if (resetViewToken) mounted.current?.resetView();
  }, [resetViewToken]);
  function handleFreeViewKeys(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!freeView || !ready || failed) return;
    const controls = mounted.current;
    if (!controls) return;
    switch (event.key) {
      case "ArrowLeft": controls.rotateView(-0.15, 0); break;
      case "ArrowRight": controls.rotateView(0.15, 0); break;
      case "ArrowUp": controls.rotateView(0, 0.15); break;
      case "ArrowDown": controls.rotateView(0, -0.15); break;
      case "+":
      case "=": controls.zoomView(true); break;
      case "-":
      case "_": controls.zoomView(false); break;
      case "0": controls.resetView(); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  return (
    <span
      className={`icon-preview ${showBackground && colors ? "with-save-background" : ""} ${freeView ? "free-view" : ""}`}
      role={freeView ? undefined : "img"}
      aria-label={freeView ? undefined : `${info.title}: ${failed || !iconPath ? "preview unavailable" : label}`}
    >
      {showBackground && colors && (
        <span
          className="icon-sys-background"
          style={{
            opacity: info.sys!.backgroundOpacity / 128,
            background: gradient(colors[0]!, colors[1]!),
          }}
          aria-hidden="true"
        >
          <span style={{ background: gradient(colors[2]!, colors[3]!) }} />
        </span>
      )}
      <canvas
        ref={canvas}
        className={failed || !iconPath ? "invisible" : ""}
        role={freeView ? "group" : undefined}
        aria-label={freeView ? `${info.title}: ${label}. Use arrow keys to rotate, plus or minus to zoom, and 0 to reset.` : undefined}
        tabIndex={freeView && ready && !failed && iconPath ? 0 : undefined}
        onKeyDown={handleFreeViewKeys}
      />
      {(!ready || failed || !iconPath) && (
        <span className="icon-fallback">
          <Box aria-hidden="true" />
          <span>{failed || !iconPath || (info.issue && iconPath === info.iconPath) ? "No preview" : "Loading icon"}</span>
        </span>
      )}
    </span>
  );
}
