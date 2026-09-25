import { useEffect, useRef, useState } from "react";
import { Box } from "lucide-react";
import type { MemoryCard } from "../core/index";
import { parseIcon } from "../icons/parser";
import type { SaveInfo } from "./model";

export function IconPreview({
  card,
  info,
  animate,
  view = "detail",
  showBackground = false,
  iconPath = info.iconPath,
  label = "PS2 save icon",
}: {
  card: Pick<MemoryCard, "readFile">;
  info: SaveInfo;
  animate: boolean;
  view?: "overview" | "detail";
  showBackground?: boolean;
  iconPath?: string | null;
  label?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mounted = useRef<{
    animate(value: boolean): void;
    dispose(): void;
  } | null>(null);
  const active = useRef(animate);
  active.current = animate;
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
            mounted.current?.dispose();
            mounted.current = null;
          }
        }, view);
        mounted.current.animate(active.current);
        setReady(true);
      } catch {
        if (alive) {
          setFailed(true);
          setReady(false);
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
  return (
    <span
      className={`icon-preview ${showBackground && colors ? "with-save-background" : ""}`}
      role="img"
      aria-label={`${info.title}: ${failed || !iconPath ? "preview unavailable" : label}`}
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
