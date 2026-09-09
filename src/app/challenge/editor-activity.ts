export interface ClipboardCounts { copy: number; cut: number; paste: number; drop: number; }
export interface ActivityEvent { offsetMs: number; kind: string; area: 'question' | 'answer'; trusted: boolean | null; }
export interface EditorActivityReport {
  version: number; questionSlug: string; startedAt: string; elapsedMs: number;
  question: ClipboardCounts; answer: ClipboardCounts;
  keydownCount: number; trustedKeydownCount: number; syntheticEvents: number;
  modelChangeCount: number; unexplainedChangeCount: number; observedPasteCount: number;
  insertedCharacters: number; deletedCharacters: number; droppedEvents: number; events: ActivityEvent[];
}
export interface ActivityEditor {
  getValue(): string;
  onDidChangeModelContent(listener: (event: ModelChange) => void): { dispose(): void };
  onDidPaste(listener: () => void): { dispose(): void };
}
interface ModelChange {
  changes: { text: string; rangeLength: number }[];
  isFlush?: boolean; isUndoing?: boolean; isRedoing?: boolean;
}

/** Client-reported observations, never a security boundary or a cheating verdict.
 * No clipboard contents, literal keys, or data from personal-detail fields are collected.
 */
export class EditorActivity {
  private readonly listeners = new AbortController();
  private readonly subscriptions: { dispose(): void }[] = [];
  private readonly origin = performance.now();
  private active = true;
  private recentInput = -Infinity;
  private lastValue: string;
  private lastClipboard?: { key: string; channel: string; at: number };
  private readonly report: EditorActivityReport;

  constructor(private readonly portal: HTMLElement, private readonly editor: ActivityEditor, slug: string) {
    this.lastValue = editor.getValue();
    const counts = (): ClipboardCounts => ({ copy: 0, cut: 0, paste: 0, drop: 0 });
    this.report = { version: 1, questionSlug: slug, startedAt: new Date().toISOString(), elapsedMs: 0,
      question: counts(), answer: counts(), keydownCount: 0, trustedKeydownCount: 0, syntheticEvents: 0,
      modelChangeCount: 0, unexplainedChangeCount: 0, observedPasteCount: 0,
      insertedCharacters: 0, deletedCharacters: 0, droppedEvents: 0, events: [] };
    const listen = (type: string, handler: (event: Event) => void) =>
      portal.ownerDocument.addEventListener(type, handler, { capture: true, signal: this.listeners.signal });
    for (const action of ['copy', 'cut', 'paste', 'drop'] as const) {
      listen(action, event => {
        const area = this.area(event, action === 'copy' || action === 'cut');
        if (area) this.block(event, area, action, 'clipboard');
      });
    }
    listen('dragstart', event => { if (this.area(event, true)) event.preventDefault(); });
    listen('keydown', event => this.keydown(event as KeyboardEvent));
    listen('beforeinput', event => {
      if (this.area(event) !== 'answer' || !this.active) return;
      const input = event as InputEvent;
      if (/^insertFromPaste/.test(input.inputType)) this.block(event, 'answer', 'paste', 'beforeinput');
      else if (input.inputType === 'insertFromDrop') this.block(event, 'answer', 'drop', 'beforeinput');
      else if (input.inputType === 'deleteByCut') this.block(event, 'answer', 'cut', 'beforeinput');
      else {
        if (event.isTrusted) this.recentInput = performance.now();
        if (input.isComposing) this.record('composition', 'answer', event.isTrusted);
      }
    });
    // Mouse-selected completions and editor commands can legitimately change the model.
    listen('pointerdown', event => {
      if (this.area(event) === 'answer' && event.isTrusted) this.recentInput = performance.now();
    });
    this.subscriptions.push(editor.onDidChangeModelContent(event => this.modelChanged(event)));
    this.subscriptions.push(editor.onDidPaste(() => {
      if (!this.active) return;
      this.report.observedPasteCount++;
      this.clipboard('answer', 'paste', 'monaco', null, 'paste-observed');
    }));
  }

  private area(event: Event, selection = false): 'question' | 'answer' | undefined {
    const target = event.target instanceof Element ? event.target : null;
    // Personal details always retain normal typing and clipboard behaviour.
    if (target?.closest('#modalOverlay')) return undefined;
    const host = this.portal.querySelector('#editorHost');
    if (target && host?.contains(target)) return 'answer';
    const question = '#problemPrompt, #problemTitle, #sampleSelect, #runOutput';
    if (target && this.portal.contains(target) && target.closest(question)) return 'question';
    if (selection) {
      const selected = this.portal.ownerDocument.getSelection();
      if (selected && !selected.isCollapsed && selected.rangeCount) {
        const range = selected.getRangeAt(0);
        for (const node of this.portal.querySelectorAll(question)) {
          if (range.intersectsNode(node)) return 'question';
        }
      }
    }
    return undefined;
  }

  private keydown(event: KeyboardEvent) {
    const area = this.area(event, true);
    if (!area || !this.active) return;
    const key = event.key.toLowerCase();
    if (area === 'answer') {
      this.report.keydownCount++;
      if (event.isTrusted) { this.report.trustedKeydownCount++; this.recentInput = performance.now(); }
      const category = event.ctrlKey || event.metaKey ? 'shortcut' : event.key.length === 1 ? 'character'
        : ['Backspace', 'Delete'].includes(event.key) ? 'delete'
        : ['Enter', 'Tab'].includes(event.key) ? 'layout' : 'navigation';
      this.record('key-' + category, area, event.isTrusted);
    }
    const modifier = (event.ctrlKey || event.metaKey) && !event.altKey;
    const action = modifier && ['c', 'x', 'v'].includes(key) ? ({ c: 'copy', x: 'cut', v: 'paste' } as const)[key as 'c' | 'x' | 'v']
      : event.shiftKey && key === 'insert' ? 'paste' : event.ctrlKey && key === 'insert' ? 'copy'
      : event.shiftKey && key === 'delete' ? 'cut' : undefined;
    if (action) this.block(event, area, action, 'shortcut');
  }

  private block(event: Event, area: 'question' | 'answer', action: keyof ClipboardCounts, channel: string) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!this.active) return;
    this.clipboard(area, action, channel, event.isTrusted, action + '-blocked');
    const notice = this.portal.querySelector('#activityStatus');
    if (notice) notice.textContent = 'Copy, cut, paste and drag/drop are disabled for this challenge. Please type your answer.';
  }

  private clipboard(area: 'question' | 'answer', action: keyof ClipboardCounts, channel: string, trusted: boolean | null, kind: string) {
    const at = performance.now();
    const key = area + ':' + action;
    // One gesture can surface as a shortcut, clipboard event, beforeinput and Monaco event.
    const duplicate = this.lastClipboard?.key === key && this.lastClipboard.channel !== channel && at - this.lastClipboard.at < 400;
    if (!duplicate) {
      this.report[area][action]++;
      this.record(kind, area, trusted);
      this.lastClipboard = { key, channel, at };
    }
  }

  private modelChanged(event: ModelChange) {
    if (!this.active) return;
    this.report.modelChangeCount++;
    const inserted = event.changes.reduce((n, change) => n + change.text.length, 0);
    this.report.insertedCharacters = Math.min(10000000, this.report.insertedCharacters + inserted);
    this.report.deletedCharacters = Math.min(10000000, this.report.deletedCharacters + event.changes.reduce((n, change) => n + change.rangeLength, 0));
    const unexplained = event.isFlush || (!event.isUndoing && !event.isRedoing && performance.now() - this.recentInput > 500);
    if (unexplained) this.report.unexplainedChangeCount++;
    this.record(unexplained ? 'unexplained-change' : event.isUndoing ? 'undo' : event.isRedoing ? 'redo' : inserted >= 80 ? 'bulk-change' : 'model-change', 'answer', null);
    this.lastValue = this.editor.getValue();
  }

  private record(kind: string, area: 'question' | 'answer', trusted: boolean | null) {
    if (trusted === false) this.report.syntheticEvents++;
    if (this.report.events.length < 5000) this.report.events.push({ offsetMs: this.offset(), kind, area, trusted });
    else this.report.droppedEvents++;
  }

  private offset() { return Math.min(86400000, Math.max(0, Math.round(performance.now() - this.origin))); }

  snapshot(): EditorActivityReport {
    if (this.active && this.editor.getValue() !== this.lastValue) {
      this.report.unexplainedChangeCount++;
      this.record('unobserved-change', 'answer', null);
      this.lastValue = this.editor.getValue();
    }
    this.report.elapsedMs = this.offset();
    return structuredClone(this.report);
  }

  dispose() {
    this.active = false;
    this.listeners.abort();
    this.subscriptions.forEach(subscription => subscription.dispose());
  }
}
