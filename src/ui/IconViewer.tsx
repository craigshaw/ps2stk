import { useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
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
  const icon = info.icons[index]!;
  const sameAsNormal = useMemo(() => {
    if (icon.label === "Normal" || !icon.path || !info.iconPath) return false;
    if (icon.path === info.iconPath) return true;
    const normal = card.readFile(info.iconPath);
    const selected = card.readFile(icon.path);
    return normal.length === selected.length && normal.every((byte, at) => byte === selected[at]);
  }, [card, icon.label, icon.path, info.iconPath]);
  return (
    <div className="icon-viewer">
      <div className="icon-viewer-stage">
        <IconPreview
          card={card}
          info={info}
          iconPath={icon.path}
          label={`${icon.label} icon`}
          animate={!paused && !reduced}
          showBackground
        />
      </div>
      <div className="icon-viewer-meta">
        <div>
          <strong>{icon.label} icon</strong>
          <span>{icon.filename}{!icon.path && " · File missing"}</span>
          {sameAsNormal && <small className="icon-duplicate-note">This file is identical to the Normal icon.</small>}
        </div>
        <button
          className="text-button"
          disabled={reduced || !icon.path}
          aria-label={paused || reduced ? "Play icon animation" : "Pause icon animation"}
          onClick={() => onPauseChange(!paused)}
        >
          {paused || reduced ? <Play /> : <Pause />}
          {paused || reduced ? "Paused" : "Pause"}
        </button>
      </div>
      {info.icons.length > 1 && (
        <div className="icon-viewer-choices" role="group" aria-label="Icons in this save">
          {info.icons.map((choice, choiceIndex) => (
            <button
              key={`${choice.label}:${choice.filename}:${choiceIndex}`}
              aria-pressed={index === choiceIndex}
              onClick={() => setIndex(choiceIndex)}
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
