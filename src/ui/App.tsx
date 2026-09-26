import { decodePackage, encodePackage } from "../browser/packages";
import type { ImportFormat } from "../formats/index";
import { ExportReview } from "./ExportReview";
import type { SaveContent } from "../core/index";
import { ImportReview } from "./ImportReview";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  File,
  FilePlus2,
  FolderOpen,
  HardDrive,
  Info,
  LayoutGrid,
  List,
  LockKeyhole,
  PanelRight,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { MemoryCard } from "../core/index";
import type { CardEntry, SaveSelection } from "../core/index";
import { CardSession, cardFilenameParts } from "../session/session";
import type { CardSlot, CardExtension } from "../session/session";
import {
  downloadBytes,
  folderPicker,
  planDump,
  readCardFile,
  readReplacement,
  readSavePackage,
  writeDump,
} from "../browser/files";
import {
  bytesLabel,
  cardDate,
  fileBytes,
  flattenFiles,
  saveInfo,
} from "./model";
import type { SaveInfo } from "./model";
import { IconPreview } from "./IconPreview";
import { IconViewer } from "./IconViewer";
import { Dialog } from "./Dialog";
import { Brand } from "./Brand";

type Modal =
  | { type: "icons"; card: MemoryCard; info: SaveInfo; initialPath: string; returnFocus: HTMLElement }
  | { type: "import"; slot: CardSlot; save: SaveContent; format: ImportFormat; expected: MemoryCard }
  | { type: "export"; save: SaveContent }
  | { type: "choose" }
  | { type: "close" | "open" | "save"; slot: CardSlot }
  | { type: "delete"; slot: CardSlot; names: string[] }
  | { type: "copy"; slot: CardSlot; names: string[] }
  | {
      type: "replace";
      slot: CardSlot;
      entry: CardEntry;
      bytes: Uint8Array;
      filename: string;
    };
const slots = [0, 1] as const;
const letter = (slot: CardSlot) => (slot === 0 ? "A" : "B");
const other = (slot: CardSlot): CardSlot => (slot === 0 ? 1 : 0);
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function App() {
  const [session] = useState(() => new CardSession());
  const [revision, setRevision] = useState(0);
  const cards = slots.map((slot) => {
    try {
      return session.state(slot);
    } catch {
      return null;
    }
  });
  const [active, setActive] = useState<CardSlot>(0);
  const [selection, setSelection] = useState<[string[], string[]]>([[], []]);
  const [inspector, setInspector] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Open a memory card to get started.");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [conflicts, setConflicts] = useState<Map<string, "skip" | "replace">>(
    () => new Map(),
  );
  const [saveExtension, setSaveExtension] = useState<CardExtension>(".ps2");
  const [renaming, setRenaming] = useState<{ slot: CardSlot; stem: string; error: string | null } | null>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [filePath, setFilePath] = useState<string | null>(null);
  const openInput = useRef<HTMLInputElement>(null),
    replacementInput = useRef<HTMLInputElement>(null);
  const packageInput = useRef<HTMLInputElement>(null);
  const packageTarget = useRef<{ slot: CardSlot; expected: MemoryCard } | null>(null);
  const target = useRef<CardSlot>(0),
    replacement = useRef<{ slot: CardSlot; entry: CardEntry } | null>(null);
  const anchors = useRef<[string | null, string | null]>([null, null]);
  const supportedFolders = !!folderPicker();
  const infos = useMemo(
    () =>
      cards.map(
        (state) =>
          state?.card.entries
            .filter((e) => e.kind === "directory")
            .map((e) => saveInfo(state.card, e)) ?? [],
      ),
    [cards[0]?.card, cards[1]?.card],
  );
  const selected = infos[active]!.filter((info) =>
    selection[active].includes(info.entry.name),
  );
  const inspected =
    selected.find((i) => i.entry.name === selection[active].at(-1)) ??
    selected[0];
  const current = cards[active];
  const files = inspected ? flattenFiles(inspected.entry) : [];
  const selectedFile = files.find((f) => f.path === filePath);
  const openCount = cards.filter(Boolean).length;

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    setFilePath(null);
  }, [active, inspected?.entry.path]);
  useEffect(() => {
    if (renaming) {
      renameInput.current?.focus();
      renameInput.current?.select();
    }
  }, [renaming?.slot]);
  useEffect(() => {
    if (!busy && !cards.some((card) => card?.needsDownload)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [revision, busy]);
  function refresh() {
    setRevision((n) => n + 1);
    setSelection(
      (old) =>
        slots.map((slot) => {
          try {
            const names = session.state(slot).card.entries.map((e) => e.name);
            return old[slot].filter((n) => names.includes(n));
          } catch {
            return [];
          }
        }) as [string[], string[]],
    );
  }
  function act(action: () => void, message: string) {
    if (busyRef.current) return;
    setError(null);
    const evictions = session.historyEvictions;
    try {
      action();
      refresh();
      setStatus(
        message +
          (session.historyEvictions > evictions
            ? " Older Undo steps were removed to keep history within 64 MiB."
            : ""),
      );
    } catch (e) {
      setError(messageOf(e));
    }
  }
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setError(messageOf(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
      refresh();
    }
  }
  function chooseFile(slot: CardSlot) {
    target.current = slot;
    setModal(null);
    setRenaming(null);
    openInput.current!.click();
  }
  function requestOpen(slot?: CardSlot) {
    if (slot === undefined) {
      const empty = slots.find((s) => !cards[s]);
      if (empty === undefined) {
        setModal({ type: "choose" });
        return;
      }
      slot = empty;
    }
    if (cards[slot]?.needsDownload) setModal({ type: "open", slot });
    else chooseFile(slot);
  }
  function saveCard(slot: CardSlot, options = {}) {
    act(
      () => {
        const output = session.prepareDownload(slot, options);
        downloadBytes(output.bytes, output.filename);
        session.markDownloadOffered(output);
      },
      `Card ${letter(slot)} download started. Keep the downloaded image to retain your edits.`,
    );
  }
  function createCard() {
    const slot = slots.find((s) => !cards[s]);
    if (slot === undefined) return;
    act(() => {
      session.create(slot, `new-card-${letter(slot).toLowerCase()}.ps2`);
      setRenaming(null);
      setActive(slot);
      setSearch("");
      setFilePath(null);
    }, `Created an empty 8 MiB card in slot ${letter(slot)}. Import saves or copy from the other card, then download your card to keep it.`);
  }
  function exportSave(slot: CardSlot, name: string) {
    act(() => setModal({ type: "export", save: session.state(slot).card.extractSave(name) }), "Choose an export output type.");
  }
  function showSaveAs(slot: CardSlot) {
    const state = cards[slot]!;
    const extension = state.filename.match(/\.[^.]+$/)?.[0].toLowerCase();
    setSaveExtension(
      extension === ".mc2" || extension === ".bin" ? extension : ".ps2",
    );
    setModal({ type: "save", slot });
  }
  function finishRename(slot: CardSlot) {
    setRenaming(null);
    requestAnimationFrame(() => document.getElementById(`rename-card-${slot}`)?.focus({ preventScroll: true }));
  }
  function applyRename(slot: CardSlot) {
    if (renaming?.slot !== slot) return;
    try {
      const changed = session.renameCard(slot, renaming.stem);
      finishRename(slot);
      if (changed) {
        const state = session.state(slot);
        refresh();
        setStatus(`Card ${letter(slot)} renamed to ${state.filename}.${state.needsDownload ? " Download the card to keep this name." : ""}`);
      }
      setError(null);
    } catch (error) {
      setRenaming({ ...renaming, error: messageOf(error) });
      renameInput.current?.focus();
    }
  }
  function select(
    slot: CardSlot,
    name: string,
    visible: SaveInfo[],
    event: MouseEvent,
    toggle = false,
  ) {
    setActive(slot);
    setSelection((old) => {
      let next: string[];
      if (event.shiftKey && anchors.current[slot]) {
        const names = visible.map((i) => i.entry.name),
          start = names.indexOf(anchors.current[slot]!),
          end = names.indexOf(name);
        next =
          start < 0
            ? [name]
            : names.slice(Math.min(start, end), Math.max(start, end) + 1);
      } else if (toggle || event.metaKey || event.ctrlKey)
        next = old[slot].includes(name)
          ? old[slot].filter((n) => n !== name)
          : [...old[slot], name];
      else next = [name];
      if (!event.shiftKey) anchors.current[slot] = name;
      const result = [...old] as [string[], string[]];
      result[slot] = next;
      return result;
    });
  }
  function selectAll(slot: CardSlot, visible: SaveInfo[]) {
    setActive(slot);
    setSelection((old) => {
      const next = [...old] as [string[], string[]];
      next[slot] = visible.map((i) => i.entry.name);
      return next;
    });
  }
  function copySelection(slot: CardSlot, names = selection[slot]) {
    setConflicts(new Map());
    setModal({ type: "copy", slot, names: [...names] });
  }
  function replaceFile(slot: CardSlot, entry: CardEntry) {
    replacement.current = { slot, entry };
    replacementInput.current!.click();
  }
  function rawDump(slot: CardSlot, entry: CardEntry) {
    act(
      () =>
        downloadBytes(
          session.state(slot).card.readFile(entry.path),
          entry.name,
        ),
      `Raw file download started: ${entry.name}.`,
    );
  }
  function keys(event: KeyboardEvent, slot: CardSlot, visible: SaveInfo[]) {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement
    )
      return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAll(slot, visible);
      return;
    }
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        ".save-select",
      ),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const columns =
      view === "list"
        ? 1
        : Math.max(
            1,
            buttons.filter(
              (b) =>
                Math.abs(
                  b.getBoundingClientRect().top -
                    buttons[0]!.getBoundingClientRect().top,
                ) < 2,
            ).length,
          );
    const movement: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
      Home: -index,
      End: buttons.length - index - 1,
    };
    if (event.key in movement) {
      event.preventDefault();
      buttons[
        Math.max(0, Math.min(buttons.length - 1, index + movement[event.key]!))
      ]?.focus();
    }
  }
  function keyboard(event: KeyboardEvent) {
    if (
      modal ||
      busy ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement
    )
      return;
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "z" &&
      current
    ) {
      event.preventDefault();
      act(
        () => {
          event.shiftKey ? session.redo(active) : session.undo(active);
        },
        `${event.shiftKey ? "Redo" : "Undo"} on card ${letter(active)}.`,
      );
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "s" &&
      current
    ) {
      event.preventDefault();
      saveCard(active);
    }
  }
  return (
    <div
      className="app"
      onKeyDown={keyboard}
      onClickCapture={(event) => {
        // Safari does not focus buttons on pointer clicks. Keep dialog return
        // focus and the active card consistent across the desktop browsers.
        (event.target as Element)
          .closest<HTMLButtonElement>("button")
          ?.focus({ preventScroll: true });
      }}
    >
      <a className="skip-link" href="#workspace">
        Skip to cards
      </a>
      <input
        ref={openInput}
        type="file"
        hidden
        aria-label="Memory card image"
        onChange={(event) => {
          const file = event.target.files?.[0],
            slot = target.current;
          event.target.value = "";
          if (!file) return;
          void run(async () => {
            const bytes = await readCardFile(file);
            new MemoryCard(bytes); // Validate before discarding the old card.
            if (cards[slot]) session.close(slot, true);
            session.open(slot, bytes, file.name);
            setActive(slot);
            setSelection((old) => {
              const next = [...old] as [string[], string[]];
              next[slot] = [];
              return next;
            });
            setStatus(
              `Opened ${file.name} in card ${letter(slot)}. Original file unchanged.`,
            );
          });
        }}
      />
      <input
        ref={replacementInput}
        type="file"
        hidden
        aria-label="Replacement file"
        onChange={(event) => {
          const file = event.target.files?.[0],
            pending = replacement.current;
          event.target.value = "";
          if (file && pending)
            void run(async () =>
              setModal({
                type: "replace",
                ...pending,
                bytes: await readReplacement(file),
                filename: file.name,
              }),
            );
        }}
      />
      <input ref={packageInput} type="file" hidden aria-label="Save package" onChange={(event) => {
        const file = event.target.files?.[0], pending = packageTarget.current;
        event.target.value = "";
        if (!file || !pending) return;
        void run(async () => {
          const { save, format } = await decodePackage(await readSavePackage(file));
          if (session.state(pending.slot).card !== pending.expected) throw new Error("The destination card changed. Import the package again.");
          setModal({ type: "import", ...pending, save, format });
        });
      }} />
      <fieldset className="application-controls" disabled={busy}>
        <header className="app-header">
          <Brand />
          <span className="local-label">
            <LockKeyhole /> Local to your browser
          </span>
          <div className="header-actions">
          <button onClick={createCard} disabled={openCount === 2}
            title={openCount === 2 ? "Close a card to create a new one" : "Create an empty 8 MiB memory card"}>
            <FilePlus2 /> New memory card
          </button>
          <button
            className="primary"
            id="open-card"
            onClick={() => requestOpen()}
          >
              <Plus /> Open memory card
          </button>
          </div>
        </header>
        <div className={`workspace-toolbar ${!openCount ? "empty-toolbar" : ""}`}>
          <div>
            <h1>Memory cards</h1>
            <span className="muted">
              {openCount
                ? `${openCount} of 2 slots in use`
                : "Your saves. Your cards."}
            </span>
          </div>
          {!!openCount && <div className="workspace-tools">
            {!!openCount && (
              <label className="search">
                <Search />
                <input
                  aria-label="Find saves"
                  placeholder="Find a save or directory"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            )}
            <div className="segmented">
              <button
                aria-label="Icon grid"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <LayoutGrid />
              </button>
              <button
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List />
              </button>
            </div>
            <button
              aria-label="Inspector"
              aria-pressed={inspector}
              onClick={() => setInspector(!inspector)}
            >
              <PanelRight />
              <span>Inspector</span>
            </button>
          </div>}
        </div>
        {!openCount ? (
          <main id="workspace" className="welcome" tabIndex={-1}>
            <div className="welcome-copy">
            <h2>Pick up where<br />you left off.</h2>
            <p>
              Open a PS2 memory card or create an empty one.
              <br />
              Bring a second card to copy between them.
            </p>
            <div className="welcome-actions">
            <button className="primary large" onClick={() => requestOpen()}>
              <FolderOpen /> Open memory card <ArrowRight />
            </button>
            <button className="large" onClick={createCard}><FilePlus2 /> New memory card</button>
            </div>
            <span className="welcome-formats">PS2 / MC2 / BIN <span>·</span> Standard 8 MiB images</span>
            </div>
            <div className="card-bays" aria-label="Available card slots">
              <svg className="bay-orbits" viewBox="0 0 500 400" fill="none" aria-hidden="true">
                <ellipse cx="250" cy="200" rx="236" ry="128" transform="rotate(-28 250 200)" />
                <ellipse cx="250" cy="200" rx="236" ry="128" transform="rotate(28 250 200)" />
                <circle cx="69" cy="95" r="4" />
                <circle cx="429" cy="305" r="3" />
              </svg>
              {slots.map((slot) => (
                <button className="card-bay" key={slot} onClick={() => requestOpen(slot)} aria-label={`Open memory card in slot ${letter(slot)}`}>
                  <span className="bay-letter">{letter(slot)}</span>
                  <span className="bay-copy"><strong>Card {letter(slot)}</strong><span>No card open</span></span>
                  <Plus aria-hidden="true" />
                </button>
              ))}
              <span className="bay-caption">Two cards. A world of saves.</span>
            </div>
            <div className="welcome-notes">
              <p><LockKeyhole /><span><strong>On your device. In your hands.</strong>Files stay in your browser. Original images stay unchanged.</span></p>
              <p><Download /><span><strong>Keep what you change.</strong>Edits last for this session. Download your card before you leave.</span></p>
            </div>
          </main>
        ) : (
          <main
            id="workspace"
            tabIndex={-1}
            className={`workspace ${inspector ? "" : "no-inspector"}`}
          >
            <div className={`card-panes ${openCount === 1 ? "one-card" : ""}`}>
              {slots
                .filter((slot) => cards[slot])
                .map((slot) => {
                  const state = cards[slot]!,
                    visible = infos[slot]!.filter((info) =>
                      `${info.title} ${info.entry.name}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    );
                  const count = selection[slot].length;
                  return (
                    <section
                      key={slot}
                      className={`card-pane ${active === slot ? "active-card" : ""}`}
                      aria-label={`Card ${letter(slot)}`}
                      onFocusCapture={() => setActive(slot)}
                      onPointerDown={() => setActive(slot)}
                    >
                      <header className="card-header">
                        <button
                          className="slot-badge"
                          aria-label={`Activate card ${letter(slot)}`}
                          aria-pressed={active === slot}
                          onClick={() => setActive(slot)}
                        >
                          <span className="slot-label">Card</span>{letter(slot)}
                        </button>
                        <div className="card-identity">
                          {renaming?.slot === slot ? (
                            <form className="card-name-editor" onSubmit={(event) => { event.preventDefault(); applyRename(slot); }}>
                              <div className="card-name-field">
                                <input
                                  ref={renameInput}
                                  aria-label={`Card ${letter(slot)} name`}
                                  aria-invalid={!!renaming.error}
                                  aria-describedby={`${renaming.error ? `card-name-error-${slot} ` : ""}card-name-extension-${slot}`}
                                  maxLength={120}
                                  value={renaming.stem}
                                  onChange={(event) => setRenaming({ slot, stem: event.target.value, error: null })}
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      finishRename(slot);
                                    }
                                  }}
                                />
                                <span id={`card-name-extension-${slot}`}>{cardFilenameParts(state.filename).extension}</span>
                              </div>
                              <button className="card-name-action" type="submit" aria-label={`Apply card ${letter(slot)} name`} title="Apply name"><Check /></button>
                              <button className="card-name-action" type="button" aria-label={`Cancel card ${letter(slot)} name`} title="Cancel" onClick={() => finishRename(slot)}><X /></button>
                            </form>
                          ) : (
                            <div className="card-name-row">
                              <h2 title={state.filename}>{state.filename}</h2>
                              <button
                                id={`rename-card-${slot}`}
                                className="card-name-action"
                                aria-label={`Rename card ${letter(slot)}`}
                                title={`Rename card ${letter(slot)}`}
                                onClick={() => setRenaming({ slot, stem: cardFilenameParts(state.filename).stem, error: null })}
                              ><Pencil /></button>
                            </div>
                          )}
                          {renaming?.slot === slot && renaming.error && <span id={`card-name-error-${slot}`} className="card-name-error" role="alert">{renaming.error}</span>}
                          <span className="muted">
                            {infos[slot]!.length} {infos[slot]!.length === 1 ? "save" : "saves"}
                          </span>
                        </div>
                        {renaming?.slot !== slot && <button
                          className="icon-button"
                          aria-label={`Close card ${letter(slot)}`}
                          onClick={() =>
                            state.needsDownload
                              ? setModal({ type: "close", slot })
                              : act(
                                  () => {
                                    session.close(slot);
                                    if (renaming?.slot === slot) setRenaming(null);
                                    if (cards[other(slot)])
                                      setActive(other(slot));
                                  },
                                  `Closed card ${letter(slot)}.`,
                                )
                          }
                        >
                          <X />
                        </button>}
                      </header>
                      <div className="capacity">
                        <div>
                          <span>{bytesLabel(state.card.freeBytes)} free</span>
                          <span
                            className={
                              state.needsDownload ? "changed" : "muted"
                            }
                          >
                            {state.needsDownload
                              ? "● Download needed"
                              : state.lastOfferedRevision
                                ? "Download offered"
                                : "Unchanged"}
                          </span>
                        </div>
                        <meter
                          min={0}
                          max={8388608}
                          value={8388608 - state.card.freeBytes}
                          aria-label={`Card ${letter(slot)} used capacity`}
                        />
                      </div>
                      <div className="card-actions">
                        <button id={`import-save-${slot}`} onClick={() => {
                          packageTarget.current = { slot, expected: session.state(slot).card };
                          packageInput.current!.click();
                        }}><Upload /> Import save</button>
                        <button onClick={() => saveCard(slot)} disabled={renaming?.slot === slot} title={renaming?.slot === slot ? "Apply or cancel the name first" : undefined}>
                          <Download /> Save card
                        </button>
                        <button onClick={() => showSaveAs(slot)} disabled={renaming?.slot === slot} title={renaming?.slot === slot ? "Apply or cancel the name first" : undefined}>
                          Save as
                        </button>
                        <span className="spacer" />
                        <button
                          className="icon-button"
                          aria-label={`Undo card ${letter(slot)}`}
                          disabled={!state.canUndo}
                          onClick={() =>
                            act(
                              () => {
                                session.undo(slot);
                              },
                              `Undid one action on card ${letter(slot)}.`,
                            )
                          }
                        >
                          <Undo2 />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Redo card ${letter(slot)}`}
                          disabled={!state.canRedo}
                          onClick={() =>
                            act(
                              () => {
                                session.redo(slot);
                              },
                              `Redid one action on card ${letter(slot)}.`,
                            )
                          }
                        >
                          <Redo2 />
                        </button>
                      </div>
                      <div className="selection-bar">
                        <span>
                          {count ? `${count} selected` : "Select a save"}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => selectAll(slot, visible)}
                        >
                          Select all
                        </button>
                        {!!count && (
                          <button
                            className="text-button"
                            onClick={() =>
                              setSelection((old) => {
                                const next = [...old] as [string[], string[]];
                                next[slot] = [];
                                return next;
                              })
                            }
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div
                        className={`save-items ${view}`}
                        onKeyDown={(e) => keys(e, slot, visible)}
                      >
                        {visible.map((info) => (
                          <SaveTile
                            key={info.entry.name}
                            card={state.card}
                            info={info}
                            selected={selection[slot].includes(info.entry.name)}
                            onSelect={(e, toggle) =>
                              select(slot, info.entry.name, visible, e, toggle)
                            }
                          />
                        ))}
                        {!visible.length && (
                          <div className="pane-empty">
                            <FolderOpen />
                            <p>
                              {search
                                ? "No matching saves."
                                : "No saves on this card."}
                            </p>
                            <small>
                              {search
                                ? "Try a different title or directory name."
                                : "Use Import save above or copy saves from the other card."}
                            </small>
                          </div>
                        )}
                      </div>
                      {state.card.entries.some((e) => e.kind === "file") && (
                        <details className="root-files">
                          <summary>Files in the card root</summary>
                          {state.card.entries
                            .filter((e) => e.kind === "file")
                            .map((file) => (
                              <div className="file-row" key={file.path}>
                                <span>{file.name}</span>
                                <button onClick={() => rawDump(slot, file)}>
                                  Dump file
                                </button>
                                <button onClick={() => replaceFile(slot, file)}>
                                  Replace
                                </button>
                              </div>
                            ))}
                        </details>
                      )}
                      <footer className="pane-footer">
                        <button disabled={count !== 1} onClick={() => exportSave(slot, selection[slot][0]!)}><Download /> Export save</button>
                        <button
                          disabled={!count || !cards[other(slot)]}
                          onClick={() => copySelection(slot)}
                        >
                          {slot === 1 && <ArrowLeft aria-hidden="true" />}
                          Copy to {letter(other(slot))}
                          {slot === 0 && <ArrowRight aria-hidden="true" />}
                        </button>
                        <button
                          disabled={!count}
                          className="danger-subtle"
                          onClick={() =>
                            setModal({
                              type: "delete",
                              slot,
                              names: [...selection[slot]],
                            })
                          }
                        >
                          <Trash2 /> Delete
                        </button>
                        {!cards[other(slot)] && (
                          <button
                            className="text-button"
                            onClick={() => requestOpen(other(slot))}
                          >
                            Open second card
                          </button>
                        )}
                      </footer>
                    </section>
                  );
                })}
            </div>
            {inspector && (
              <aside className="inspector" aria-label="Save inspector">
                <div className="inspector-heading">
                  <span className="inspector-label">Inspector</span>
                  <span className="tag">Card {letter(active)}</span>
                </div>
                {inspected && current ? (
                  <>
                    <div className="large-preview">
                      <IconPreview
                        key={`${active}:${inspected.entry.path}`}
                        card={current.card}
                        info={inspected}
                        animate={!paused && !reduced}
                        showBackground
                      />
                    </div>
                    <div className="preview-caption">
                      <span>
                        {reduced ? "Reduced motion" : "Original PS2 icon"}
                      </span>
                      <button
                        className="text-button"
                        disabled={reduced}
                        aria-label={
                          paused || reduced
                            ? "Play icon animation"
                            : "Pause icon animation"
                        }
                        onClick={() => setPaused(!paused)}
                      >
                        {paused || reduced ? <Play /> : <Pause />}
                        {paused || reduced ? "Paused" : "Pause"}
                      </button>
                    </div>
                    {inspected.icons.some((icon) => icon.path) && (
                      <button
                        className="view-icon-button"
                        onClick={(event) => setModal({
                          type: "icons",
                          card: current.card,
                          info: inspected,
                          initialPath: inspected.iconPath ?? inspected.icons.find((icon) => icon.path)!.path!,
                          returnFocus: event.currentTarget,
                        })}
                      >
                        <Eye /> {inspected.icons.length > 1 ? "View icons" : "View icon"}
                      </button>
                    )}
                    <h2>{inspected.title}</h2>
                    <p className="directory-name">{inspected.entry.name}</p>
                    {selected.length > 1 && (
                      <p className="small muted">
                        Inspecting one of {selected.length} selected saves.
                        Batch actions are in card {letter(active)}.
                      </p>
                    )}
                    <dl className="save-details">
                      <div>
                        <dt>File contents</dt>
                        <dd>{bytesLabel(fileBytes(inspected.entry))}</dd>
                      </div>
                      <div>
                        <dt>Files</dt>
                        <dd>{files.length}</dd>
                      </div>
                      <div>
                        <dt>Modified</dt>
                        <dd>{cardDate(inspected.entry.modified)}</dd>
                      </div>
                    </dl>
                    <div className="inspector-actions">
                      <button
                        className="primary"
                        disabled={!cards[other(active)]}
                        onClick={() =>
                          copySelection(active, [inspected.entry.name])
                        }
                      >
                        <Copy />
                        Copy save to card {letter(other(active))}
                      </button>
                    </div>
                    <div className="files-heading">
                      <h3>Save files</h3>
                      <span>{files.length}</span>
                    </div>
                    <div className="file-list">
                      {files.map((file) => (
                        <button
                          key={file.path}
                          className={`file-row ${filePath === file.path ? "selected-file" : ""}`}
                          aria-pressed={filePath === file.path}
                          onClick={() => setFilePath(file.path)}
                        >
                          <File />
                          <span>
                            {file.path.slice(inspected.entry.path.length + 1)}
                          </span>
                          <small>{bytesLabel(file.length)}</small>
                          <ChevronRight />
                        </button>
                      ))}
                    </div>
                    {selectedFile && (
                      <div className="file-details">
                        <p className="directory-name">{selectedFile.name}</p>
                        <p className="small muted">
                          Modified {cardDate(selectedFile.modified)}
                          <br />
                          Mode 0x{selectedFile.mode.toString(16)} · Attributes
                          0x{selectedFile.attributes.toString(16)}
                        </p>
                        <div className="file-actions">
                          {inspected.icons.some((icon) => icon.path === selectedFile.path) && (
                            <button onClick={(event) => setModal({ type: "icons", card: current.card, info: inspected, initialPath: selectedFile.path, returnFocus: event.currentTarget })}>
                              <Eye /> View icon
                            </button>
                          )}
                          <button onClick={() => rawDump(active, selectedFile)}>
                            <Download />
                            Dump file
                          </button>
                          <button
                            onClick={() => replaceFile(active, selectedFile)}
                          >
                            <Upload />
                            Replace file
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="inspector-empty">
                    <Info />
                    <h2>A closer look</h2>
                    <p>
                      Select a save to see its icon, details, and individual
                      files.
                    </p>
                    <small>
                      Use Ctrl or ⌘ click to select several saves. Shift click
                      selects a range.
                    </small>
                  </div>
                )}
              </aside>
            )}
          </main>
        )}
      </fieldset>
      <footer className="statusbar">
        <span role="status" aria-live="polite">
          {busy ? "Working with your local files…" : status}
        </span>
        <span className="muted">
          Session only <span className="dot-separator">·</span> PS2 / MC2 / BIN
          <span className="dot-separator">·</span>
          <a href="/third-party-notices.txt" target="_blank" rel="noreferrer">
            Licenses
          </a>
        </span>
      </footer>
      {error && modal?.type !== "export" && (
        <div className="error-banner" role="alert">
          <Info />
          <div>
            <strong>Action could not finish</strong>
            <p>{error}</p>
          </div>
          <button aria-label="Dismiss error" onClick={() => setError(null)}>
            <X />
          </button>
        </div>
      )}
      {modal && (
        <Dialog
          className={modal.type === "icons" ? "icon-dialog" : undefined}
          returnFocus={modal.type === "import" ? document.getElementById(`import-save-${modal.slot}`) : modal.type === "icons" ? modal.returnFocus : null}
          title={
            {
              choose: "Both card slots are in use",
              close: "Close this memory card?",
              open: "Open another memory card?",
              delete: "Delete selected saves?",
              copy: "Copy complete saves",
              replace: "Replace this file?",
              save: "Save memory card as",
              import: "Review save import",
              export: "Export save",
              icons: "View icons",
            }[modal.type]
          }
          onClose={() => { if (!busyRef.current) setModal(null); }}
          busy={busy}
        >
          {modal.type === "icons" && (
            <IconViewer
              card={modal.card}
              info={modal.info}
              initialPath={modal.initialPath}
              paused={paused}
              reduced={reduced}
              onPauseChange={setPaused}
            />
          )}
          {modal.type === "import" && <ImportReview save={modal.save} format={modal.format} card={modal.expected}
            destination={`Card ${letter(modal.slot)}: ${cards[modal.slot]?.filename ?? 'Closed card'}`}
            onApply={(choice) => act(() => {
              const changed = session.importSave(modal.slot, modal.save, modal.expected, choice);
              if (changed) {
                setActive(modal.slot); setSearch("");
                setSelection(old => { const next = [...old] as [string[], string[]]; next[modal.slot] = [modal.save.name]; return next; });
              }
              setModal(null);
            }, choice === "skip" && modal.expected.entries.some(e => e.name === modal.save.name) ? "Skipped existing save. Card unchanged." : "Imported save. Download the card to retain this edit.")}
          />}
          {modal.type === "export" && error && <p role="alert">{error}</p>}
          {modal.type === "export" && <ExportReview save={modal.save} busy={busy} supportedFolders={supportedFolders}
            onFolder={() => { void run(async () => {
              const plan = planDump(modal.save, modal.save.entry);
              const picker = folderPicker();
              if (!picker) throw new Error("Raw files to folder requires Chrome or Edge with directory access.");
              const directory = await picker({ mode: "readwrite" });
              const count = await writeDump(directory, plan);
              setModal(null);
              setStatus(`Exported ${count} raw files into ${plan.name}. Whole-card download status is unchanged.`);
            }); }}
            onDownload={(format, acknowledged) => { void run(async () => {
            const output = await encodePackage(modal.save, format, acknowledged);
            downloadBytes(output.bytes, output.filename); setModal(null);
            setStatus("Save package download started. Whole-card download status is unchanged.");
          }); }} />}
          {modal.type === "choose" && (
            <>
              <p>
                Choose which card to replace. You can download it first with
                Save card.
              </p>
              <div className="slot-choices">
                {slots.map((slot) => (
                  <button key={slot} onClick={() => requestOpen(slot)}>
                    <HardDrive />
                    <span>
                      Card {letter(slot)}
                      <strong>{cards[slot]!.filename}</strong>
                      <small>
                        {cards[slot]!.needsDownload
                          ? "Has edits to download"
                          : "No undownloaded edits"}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {(modal.type === "close" || modal.type === "open") && (
            <>
              <p>
                Card {letter(modal.slot)} has not been downloaded in its current state.{" "}
                {modal.type === "open"
                  ? "It will be discarded after a valid replacement card is opened."
                  : "Closing it discards this card and its Undo history."}
              </p>
              <p className="directory-name">{cards[modal.slot]!.filename}</p>
              <div className="dialog-actions">
                <button
                  onClick={() => {
                    saveCard(modal.slot);
                    setModal(null);
                  }}
                >
                  Download and keep open
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    if (modal.type === "open") chooseFile(modal.slot);
                    else {
                      act(() => {
                        session.close(modal.slot, true);
                        if (renaming?.slot === modal.slot) setRenaming(null);
                        if (cards[other(modal.slot)])
                          setActive(other(modal.slot));
                      }, "Closed card and discarded its edits.");
                      setModal(null);
                    }
                  }}
                >
                  {modal.type === "open"
                    ? "Choose replacement card"
                    : "Discard and close"}
                </button>
              </div>
            </>
          )}
          {modal.type === "delete" && (
            <>
              <p>
                Delete {modal.names.length} complete{" "}
                {modal.names.length === 1 ? "save" : "saves"} from card{" "}
                {letter(modal.slot)}, including all contained files. You can
                Undo this action.
              </p>
              <ul className="name-list">
                {modal.names.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              <div className="dialog-actions">
                <button onClick={() => setModal(null)}>Cancel</button>
                <button
                  className="danger"
                  onClick={() => {
                    act(
                      () => {
                        session.deleteSaves(modal.slot, modal.names);
                      },
                      `Deleted ${modal.names.length} saves from card ${letter(modal.slot)}. Undo is available.`,
                    );
                    setModal(null);
                  }}
                >
                  <Trash2 />
                  Delete saves
                </button>
              </div>
            </>
          )}
          {modal.type === "copy" && (
            <>
              <p>
                Card {letter(modal.slot)} <ArrowRight className="inline-icon" />{" "}
                Card {letter(other(modal.slot))}
              </p>
              <p className="small muted">
                {cards[modal.slot]!.filename} →{" "}
                {cards[other(modal.slot)]!.filename}
              </p>
              <p>
                {bytesLabel(cards[other(modal.slot)]!.card.freeBytes)} free at
                the destination. All chosen saves copy together, including their
                directory allocation.
              </p>
              <div className="copy-plan">
                {modal.names.map((name) => {
                  const source = infos[modal.slot]!.find(
                      (i) => i.entry.name === name,
                    )!,
                    existing = cards[other(modal.slot)]!.card.entries.find(
                      (e) => e.name === name,
                    );
                  return (
                    <div className="copy-choice" key={name}>
                      <strong>{source.title}</strong>
                      <span className="directory-name">{name}</span>
                      <small>
                        Source: {bytesLabel(fileBytes(source.entry))} ·{" "}
                        {flattenFiles(source.entry).length} files ·{" "}
                        {cardDate(source.entry.modified)}
                      </small>
                      {existing ? (
                        <>
                          <small>
                            Destination: {bytesLabel(fileBytes(existing))} ·{" "}
                            {flattenFiles(existing).length} files ·{" "}
                            {cardDate(existing.modified)}
                          </small>
                          <label>
                            Existing directory{" "}
                            <select
                              aria-label={`Conflict for ${name}`}
                              value={conflicts.get(name) ?? "skip"}
                              onChange={(e) =>
                                setConflicts((old) =>
                                  new Map(old).set(
                                    name,
                                    e.target.value as "skip" | "replace",
                                  ),
                                )
                              }
                            >
                              <option value="skip">Skip</option>
                              <option value="replace">
                                Replace entire save
                              </option>
                            </select>
                          </label>
                        </>
                      ) : (
                        <small className="accent">New save</small>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="small muted">
                {modal.names.some((name) => cards[other(modal.slot)]!.card.entries.some((entry) => entry.name === name)) && (
                  <>Replace removes the entire destination save. Files are not merged. </>
                )}
                Insufficient space leaves both cards unchanged.
              </p>
              <div className="dialog-actions">
                <button onClick={() => setModal(null)}>Cancel</button>
                <button
                  className="primary"
                  onClick={() => {
                    const choices: SaveSelection[] = modal.names.map(
                      (name) => ({
                        name,
                        onConflict: conflicts.get(name) ?? "skip",
                      }),
                    );
                    act(
                      () => {
                        const changed = session.copySaves(
                          modal.slot,
                          other(modal.slot),
                          choices,
                        );
                        setActive(other(modal.slot));
                        if (!changed)
                          setTimeout(
                            () =>
                              setStatus(
                                "All selected saves were skipped. Both cards are unchanged.",
                              ),
                            0,
                          );
                      },
                      `Copy completed to card ${letter(other(modal.slot))}. Skipped saves are unchanged.`,
                    );
                    setModal(null);
                  }}
                >
                  <Copy />
                  Apply copy choices
                </button>
              </div>
            </>
          )}
          {modal.type === "replace" && (
            <>
              <p>
                Replace the bytes of <strong>{modal.entry.name}</strong> in card{" "}
                {letter(modal.slot)}.
              </p>
              <p className="directory-name">{modal.entry.path}</p>
              <div className="replace-comparison">
                <span>
                  Current<strong>{bytesLabel(modal.entry.length)}</strong>
                </span>
                <ArrowRight />
                <span>
                  {modal.filename}
                  <strong>{bytesLabel(modal.bytes.length)}</strong>
                </span>
              </div>
              <p>
                The original name and metadata are retained. Game-specific
                checksums are not updated. You can Undo this action.
              </p>
              <div className="dialog-actions">
                <button onClick={() => setModal(null)}>Cancel</button>
                <button
                  className="primary"
                  onClick={() => {
                    act(
                      () => {
                        session.replaceFile(
                          modal.slot,
                          modal.entry.path,
                          modal.bytes,
                        );
                      },
                      `Replaced ${modal.entry.name}. Download card ${letter(modal.slot)} to retain the change.`,
                    );
                    setModal(null);
                  }}
                >
                  Replace file
                </button>
              </div>
            </>
          )}
          {modal.type === "save" && (
            <>
              <p>
                Download a complete image of card {letter(modal.slot)}. Your
                original file stays unchanged.
              </p>
              <label className="form-field">
                Card file type
                <select
                  value={saveExtension}
                  onChange={(e) =>
                    setSaveExtension(e.target.value as CardExtension)
                  }
                >
                  <option>.ps2</option>
                  <option>.mc2</option>
                  <option>.bin</option>
                </select>
              </label>
              <p className="small muted">
                Save as changes this download only. Save card uses the name
                shown on the card.
              </p>
              <div className="dialog-actions">
                <button onClick={() => setModal(null)}>Cancel</button>
                <button
                  className="primary"
                  onClick={() => {
                    saveCard(modal.slot, {
                      extension: saveExtension,
                    });
                    setModal(null);
                  }}
                >
                  <Download />
                  Download card
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}

function SaveTile({
  card,
  info,
  selected,
  onSelect,
}: {
  card: MemoryCard;
  info: SaveInfo;
  selected: boolean;
  onSelect(event: MouseEvent, toggle: boolean): void;
}) {
  return (
    <div
      className={`save-tile ${selected ? "selected" : ""}`}
    >
      <button
        className="save-select"
        aria-label={`Select ${info.title} (${info.entry.name})`}
        aria-pressed={selected}
        onClick={(e) => onSelect(e, false)}
      >
        <IconPreview
          card={card}
          info={info}
          animate={false}
          view="overview"
        />
        <span className="save-label">
          <strong>{info.title}</strong>
          <span className="save-id">{info.entry.name}</span>
          <small>
            {bytesLabel(fileBytes(info.entry))}{" "}
            <span>· {flattenFiles(info.entry).length} files</span>
          </small>
        </span>
      </button>
      <button
        className="selection-check"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Include ${info.entry.name} in selection`}
        onClick={(e) => onSelect(e, true)}
      >
        {selected && <Check />}
      </button>
    </div>
  );
}
