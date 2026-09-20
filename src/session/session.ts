import { exportSavePackage } from '../formats/index';
import type { ExportFormat } from '../formats/index';
import { CardError, MemoryCard, SaveContent } from '../core/index';
import type { CardLayout, SaveSelection } from '../core/index';

export type CardSlot = 0 | 1;
export type CardExtension = '.ps2' | '.mc2' | '.bin';
export interface SaveOptions { readonly layout?: CardLayout; readonly extension?: CardExtension }
export interface CardDownload {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly revision: number;
}
export interface SessionCard {
  readonly card: MemoryCard;
  readonly filename: string;
  readonly revision: number;
  readonly lastOfferedRevision: number | null;
  readonly needsDownload: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}
interface Snapshot { revision: number; order: number; bytes: Uint8Array }
interface OpenCard {
  card: MemoryCard;
  filename: string;
  identity: number;
  revision: number;
  baselineRevision: number;
  lastOfferedRevision: number | null;
  undo: Snapshot[];
  redo: Snapshot[];
}

export const DEFAULT_HISTORY_BYTES = 64 * 1024 * 1024;
const MAX_CARD_BYTES = 8650752;

/** Page-session state only. The UI owns confirmations and browser download I/O. */
export class CardSession {
  readonly #cards = new Map<CardSlot, OpenCard>();
  readonly #downloads = new WeakMap<CardDownload, { slot: CardSlot; identity: number; revision: number }>();
  readonly historyLimitBytes: number;
  #sequence = 0;
  #evictions = 0;

  constructor(historyLimitBytes = DEFAULT_HISTORY_BYTES) {
    if (!Number.isSafeInteger(historyLimitBytes) || historyLimitBytes < MAX_CARD_BYTES || historyLimitBytes > DEFAULT_HISTORY_BYTES) {
      throw new CardError('invalid-operation', `History limit must be between ${MAX_CARD_BYTES} and ${DEFAULT_HISTORY_BYTES} bytes.`);
    }
    this.historyLimitBytes = historyLimitBytes;
  }

  get historyBytes(): number {
    let total = 0;
    for (const card of this.#cards.values()) for (const snapshot of [...card.undo, ...card.redo]) total += snapshot.bytes.length;
    return total;
  }
  get historyEvictions(): number { return this.#evictions; }

  #get(slot: CardSlot): OpenCard {
    const card = this.#cards.get(slot);
    if (!card) throw new CardError('not-found', `No card is open in slot ${slot}.`);
    return card;
  }
  #dirty(card: OpenCard): boolean {
    return card.revision !== (card.lastOfferedRevision ?? card.baselineRevision);
  }

  open(slot: CardSlot, bytes: Uint8Array, filename: string): void {
    if (slot !== 0 && slot !== 1) throw new CardError('invalid-operation', 'Only two card slots are available.');
    if (this.#cards.has(slot)) throw new CardError('conflict', 'Close the existing card before opening another in this slot.');
    const card = new MemoryCard(bytes);
    const revision = ++this.#sequence;
    this.#cards.set(slot, { card, filename: filename.split(/[\\/]/).at(-1) || 'memory-card.ps2',
      identity: revision, revision, baselineRevision: revision, lastOfferedRevision: null, undo: [], redo: [] });
  }

  close(slot: CardSlot, discardChanges = false): void {
    if (this.#dirty(this.#get(slot)) && !discardChanges) throw new CardError('conflict', 'This card has changes that have not been offered as a download.');
    this.#cards.delete(slot);
  }

  state(slot: CardSlot): SessionCard {
    const card = this.#get(slot);
    return Object.freeze({ card: card.card, filename: card.filename, revision: card.revision,
      lastOfferedRevision: card.lastOfferedRevision, needsDownload: this.#dirty(card),
      canUndo: card.undo.length > 0, canRedo: card.redo.length > 0 });
  }

  #trim(): void {
    while (this.historyBytes > this.historyLimitBytes) {
      // Remove only a boundary: oldest Undo or farthest Redo. Remaining steps
      // stay contiguous. The newest snapshot is always retained by the minimum budget.
      const stacks = [...this.#cards.values()].flatMap(card => [card.undo, card.redo]).filter(stack => stack.length);
      stacks.sort((a, b) => a[0]!.order - b[0]!.order);
      stacks[0]!.shift();
      this.#evictions++;
    }
  }

  #commit(slot: CardSlot, next: MemoryCard): boolean {
    const card = this.#get(slot);
    if (next === card.card) return false;
    const before = card.card.export();
    if (next.byteLength === before.length) {
      const after = next.export();
      if (before.every((byte, i) => byte === after[i])) return false;
    }
    card.undo.push({ revision: card.revision, order: ++this.#sequence, bytes: before });
    card.redo = [];
    card.card = next;
    card.revision = ++this.#sequence;
    this.#trim();
    return true;
  }

  copySaves(source: CardSlot, destination: CardSlot, selections: readonly SaveSelection[]): boolean {
    if (source === destination) throw new CardError('invalid-operation', 'Select the other card as the copy destination.');
    return this.#commit(destination, this.#get(source).card.copySavesTo(this.#get(destination).card, selections));
  }
  /** The immutable card identity also detects close/reopen and asynchronous stale reviews. */
  importSave(slot: CardSlot, save: SaveContent, expected: MemoryCard, conflict: 'skip' | 'replace' | 'error' = 'skip'): boolean {
    if (this.#get(slot).card !== expected) throw new CardError('conflict', 'The destination card changed. Import the package again to review current capacity and conflicts.');
    return this.#commit(slot, expected.importSave(save, conflict));
  }
  prepareSaveExport(slot: CardSlot, name: string, format: ExportFormat = 'psu', acknowledgeLoss = false): { bytes: Uint8Array; filename: string } {
    return exportSavePackage(this.#get(slot).card.extractSave(name), format, acknowledgeLoss);
  }
  deleteSaves(slot: CardSlot, names: readonly string[]): boolean {
    return this.#commit(slot, this.#get(slot).card.deleteSaves(names));
  }
  replaceFile(slot: CardSlot, path: string, bytes: Uint8Array): boolean {
    return this.#commit(slot, this.#get(slot).card.replaceFile(path, bytes));
  }
  convertLayout(slot: CardSlot, layout: CardLayout): boolean {
    return this.#commit(slot, this.#get(slot).card.withLayout(layout));
  }

  #restore(slot: CardSlot, direction: 'undo' | 'redo'): boolean {
    const card = this.#get(slot);
    const from = card[direction], to = card[direction === 'undo' ? 'redo' : 'undo'];
    const snapshot = from.at(-1);
    if (!snapshot) return false;
    const restored = new MemoryCard(snapshot.bytes);
    const previous = card.card.export();
    from.pop();
    to.push({ revision: card.revision, order: ++this.#sequence, bytes: previous });
    card.card = restored;
    card.revision = snapshot.revision;
    this.#trim();
    return true;
  }
  undo(slot: CardSlot): boolean { return this.#restore(slot, 'undo'); }
  redo(slot: CardSlot): boolean { return this.#restore(slot, 'redo'); }

  prepareDownload(slot: CardSlot, options: SaveOptions = {}): CardDownload {
    const card = this.#get(slot);
    let filename = card.filename;
    if (options.extension !== undefined) {
      if (!['.ps2', '.mc2', '.bin'].includes(options.extension)) throw new CardError('unsupported', 'Choose .ps2, .mc2, or .bin.');
      const stem = filename.replace(/\.[^.]*$/, '') || 'memory-card';
      filename = stem + options.extension;
    }
    const download = Object.freeze({ bytes: card.card.export(options.layout), filename, revision: card.revision });
    this.#downloads.set(download, { slot, identity: card.identity, revision: card.revision });
    return download;
  }

  /** Call only after initiating the whole-card download. This does not verify disk persistence. */
  markDownloadOffered(download: CardDownload): void {
    const prepared = this.#downloads.get(download);
    if (!prepared || this.#cards.get(prepared.slot)?.identity !== prepared.identity) {
      throw new CardError('invalid-operation', 'The download does not belong to a currently open card.');
    }
    this.#get(prepared.slot).lastOfferedRevision = prepared.revision;
    this.#downloads.delete(download);
  }
}
