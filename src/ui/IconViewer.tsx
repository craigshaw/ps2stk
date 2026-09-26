import { useMemo, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { MemoryCard } from "../core/index";
import { IconPreview } from "./IconPreview";
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
  const [resetViewToken, setResetViewToken] = useState(0);
  const icon = info.icons[index]!;
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
    <div className="icon-viewer">
      <div className="icon-viewer-toolbar">
        <div className="segmented" role="group" aria-label="Icon view mode">
          <button aria-pressed={mode === "playback"} onClick={() => setMode("playback")}>Playback</button>
          <button aria-pressed={mode === "free"} disabled={!icon.path || !previewReady} onClick={() => setMode("free")}>Free View</button>
        </div>
      </div>
      <div className="icon-viewer-stage">
        <IconPreview
          card={card}
          info={info}
          iconPath={icon.path}
          label={`${icon.label} icon`}
          animate={mode === "playback" && !paused && !reduced}
          showBackground
          freeView={mode === "free"}
          resetViewToken={resetViewToken}
          onReadyChange={setPreviewReady}
        />
      </div>
      <div className="icon-viewer-meta">
        <div>
          <strong>{icon.label} icon</strong>
          <span>{icon.filename}{!icon.path && " · File missing"}</span>
        </div>
        {mode === "playback" ? (
          <button
            className="text-button"
            disabled={reduced || !icon.path}
            aria-label={paused || reduced ? "Play icon animation" : "Pause icon animation"}
            onClick={() => onPauseChange(!paused)}
          >
            {paused || reduced ? <Play /> : <Pause />}
            {paused || reduced ? "Paused" : "Pause"}
          </button>
        ) : (
          <button className="text-button" disabled={!previewReady} onClick={() => setResetViewToken((token) => token + 1)}>
            <RotateCcw /> Reset view
          </button>
        )}
      </div>
      <p className="small muted icon-viewer-help">
        Free View: drag to rotate, scroll to zoom. Focus the model to use arrow keys to rotate, + to zoom in, - to zoom out, and 0 to reset.
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
