import { useEffect, useRef, useState } from "react";
import { Box } from "lucide-react";
import type { MemoryCard } from "../core/index";
import { parseIcon } from "../icons/parser";
import type { SaveInfo } from "./model";

export function IconPreview({
  card,
  info,
  animate,
}: {
  card: Pick<MemoryCard, "readFile">;
  info: SaveInfo;
  animate: boolean;
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
      if (mounted.current || !info.sys || !info.iconPath) return;
      try {
        const { mountPreview } = await import("../icons/renderer");
        if (!alive || !visible || current !== generation) return;
        const model = parseIcon(card.readFile(info.iconPath));
        mounted.current = mountPreview(element, model, info.sys, () => {
          if (alive) {
            setFailed(true);
            mounted.current?.dispose();
            mounted.current = null;
          }
        });
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
  }, [card, info]);
  useEffect(() => mounted.current?.animate(animate), [animate]);
  return (
    <span
      className="icon-preview"
      role="img"
      aria-label={`${info.title}: ${failed || !info.iconPath ? "preview unavailable" : "PS2 save icon"}`}
    >
      <canvas
        ref={canvas}
        className={failed || !info.iconPath ? "invisible" : ""}
      />
      {(!ready || failed || !info.iconPath) && (
        <span className="icon-fallback">
          <Box aria-hidden="true" />
          <span>{failed || info.issue ? "No preview" : "Loading icon"}</span>
        </span>
      )}
    </span>
  );
}
