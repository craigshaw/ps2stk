import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Pause, Play, RotateCcw, StepBack, StepForward } from "lucide-react";
import type { MemoryCard } from "../core/index";
import { IconPreview } from "./IconPreview";
import type { IconPreviewHandle } from "./IconPreview";
import type { SaveInfo } from "./model";

export function IconViewer({
  card,
  info,
  initialPath,
  paused,
  reduced,
  onPauseChange,
}: {
  card: MemoryCard;
  info: SaveInfo;
  initialPath: string;
  paused: boolean;
  reduced: boolean;
  onPauseChange(value: boolean): void;
}) {
  const [index, setIndex] = useState(() =>
    Math.max(0, info.icons.findIndex((icon) => icon.path === initialPath)),
  );
  const [mode, setMode] = useState<"playback" | "free">("playback");
  const [previewReady, setPreviewReady] = useState(false);
  const [stepSupported, setStepSupported] = useState(false);
  const preview = useRef<IconPreviewHandle>(null);
  const [resetViewToken, setResetViewToken] = useState(0);
  const icon = info.icons[index]!;
  const canStep = mode === "free" && previewReady && stepSupported && (paused || reduced);
  function handleFrameKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (!canStep || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== "," && event.key !== ".") return;
    event.preventDefault();
    event.stopPropagation();
    preview.current?.stepFrame(event.key === "," ? -1 : 1);
  }
  const hasDifferentIcons = useMemo(() => {
    let first: Uint8Array | null = null;
    const seen = new Set<string>();
    for (const choice of info.icons) {
      if (!choice.path || seen.has(choice.path)) continue;
      seen.add(choice.path);
      const bytes = card.readFile(choice.path);
      if (first && (first.length !== bytes.length || first.some((byte, at) => byte !== bytes[at])))
        return true;
      first = bytes;
    }
    return false;
  }, [card, info.icons]);
  return (
    <div className="icon-viewer" onKeyDown={handleFrameKeys}>
      <div className="icon-viewer-toolbar">
        {mode === "free" && (
          <button className="text-button" disabled={!previewReady} onClick={() => setResetViewToken((token) => token + 1)}>
            <RotateCcw /> Reset view
          </button>
        )}
        <div className="segmented" role="group" aria-label="Icon view mode">
          <button aria-pressed={mode === "playback"} onClick={() => setMode("playback")}>Playback</button>
          <button aria-pressed={mode === "free"} disabled={!icon.path || !previewReady} onClick={() => setMode("free")}>Free View</button>
        </div>
      </div>
      <div className="icon-viewer-stage">
        <IconPreview
          ref={preview}
          card={card}
          info={info}
          iconPath={icon.path}
          label={`${icon.label} icon`}
          animate={!paused && !reduced}
          showBackground
          freeView={mode === "free"}
          resetViewToken={resetViewToken}
          onReadyChange={(ready, canStepFrames = false) => {
            setPreviewReady(ready);
            setStepSupported(canStepFrames);
          }}
        />
      </div>
      <div className="icon-viewer-meta">
        <div className="icon-viewer-description">
          <strong>{icon.label} icon</strong>
          <span>{icon.filename}{!icon.path && " · File missing"}</span>
        </div>
        <div className="icon-viewer-transport" role="group" aria-label="Animation controls">
          <button
            className="text-button icon-frame-step"
            style={{ visibility: mode === "free" ? undefined : "hidden" }}
            aria-hidden={mode !== "free"}
            disabled={!canStep}
            aria-label="Previous frame"
            aria-keyshortcuts=","
            title="Previous frame (,). Pause animation to step."
            onClick={() => preview.current?.stepFrame(-1)}
          ><StepBack /></button>
          <button
            className="text-button icon-animation-toggle"
            disabled={reduced || !icon.path || !previewReady}
            aria-label={paused || reduced ? "Play icon animation" : "Pause icon animation"}
            onClick={() => onPauseChange(!paused)}
          >
            {paused || reduced ? <Play /> : <Pause />}
            {paused || reduced ? "Play" : "Pause"}
          </button>
          <button
            className="text-button icon-frame-step"
            style={{ visibility: mode === "free" ? undefined : "hidden" }}
            aria-hidden={mode !== "free"}
            disabled={!canStep}
            aria-label="Next frame"
            aria-keyshortcuts="."
            title="Next frame (.). Pause animation to step."
            onClick={() => preview.current?.stepFrame(1)}
          ><StepForward /></button>
        </div>
      </div>
      <p className="small muted icon-viewer-help">
        Free View: drag to rotate, scroll to zoom. Focus the model to use arrow keys to rotate, + or - to zoom, and 0 to reset. While paused, use <kbd>,</kbd> and <kbd>.</kbd> to step frames.
      </p>
      {hasDifferentIcons && (
        <div className="icon-viewer-choices" role="group" aria-label="Icons in this save">
          {info.icons.map((choice, choiceIndex) => (
            <button
              key={`${choice.label}:${choice.filename}:${choiceIndex}`}
              aria-pressed={index === choiceIndex}
              onClick={() => {
                setPreviewReady(false);
                setIndex(choiceIndex);
                if (!choice.path) setMode("playback");
              }}
            >
              <strong>{choice.label}</strong>
              <span>{choice.filename}</span>
            </button>
          ))}
        </div>
      )}
      {reduced && <p className="small muted">Animation is paused by your reduced motion setting.</p>}
    </div>
  );
}
