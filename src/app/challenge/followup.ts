import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, signal } from '@angular/core';

export interface FollowupQuestion {
  ordinal: number; kind: 'FIB' | 'MCQ' | 'DRAG_DROP' | 'DEBUG' | 'SHORT_ANSWER';
  prompt: string; options: { id: string; text: string }[];
  debug?: { starterCode: string; prefix: string; suffix: string; languageId: number } | null;
}
export interface FollowupView {
  round: number; question: FollowupQuestion;
  submit: (answers: string[], sourceCode?: string) => Promise<void>;
  samples?: { stdin: string; expectedOutput: string }[];
  run?: (sourceCode: string, stdin: string) => Promise<DebugRunResult>;
}
export interface DebugRunResult { status: string; stdout: string | null; stderr: string | null; execTimeMs: number | null; }

@Component({
  selector: 'app-followup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.active]': '!!view()', '[class.drag-layout]': 'view()?.question?.kind === "DRAG_DROP"', '(copy)': '$event.preventDefault()', '(cut)': '$event.preventDefault()', '(paste)': '$event.preventDefault()' },
  template: `
    @if (view(); as v) {
      <section aria-labelledby="followupHeading">
        <p class="progress" id="followupTitle">Question {{ v.round }} · Follow-up {{ v.question.ordinal }} of 5</p>
        <h2 id="followupHeading">{{ label() }}</h2>
        @if (v.question.kind !== 'DEBUG' || !v.question.debug) {
          <pre id="followupPrompt">{{ v.question.prompt }}</pre>
        }
        @switch (v.question.kind) {
          @case ('MCQ') {
            <div class="choices" role="group" aria-label="Choose one answer">
              @for (option of v.question.options; track option.id) {
                <button type="button" [disabled]="busy()" [class.selected]="answers()[0] === option.id"
                  [attr.aria-pressed]="answers()[0] === option.id" (click)="answers.set(answers()[0] === option.id ? [] : [option.id])">
                  <strong>{{ option.id }}.</strong> {{ option.text }}
                </button>
              }
            </div>
          }
          @case ('DRAG_DROP') {
            <p>Drag pieces into the slots, or select a piece and then select a slot.</p>
            <div class="drag-columns">
            <div class="pieces" role="group" aria-label="Available pieces">
              <h3>Available pieces</h3>
              @for (option of v.question.options; track option.id) {
                <button type="button" draggable="true" [disabled]="busy()"
                  [attr.aria-pressed]="piece() === option.id" [class.selected]="piece() === option.id"
                  (dragstart)="drag($event, option.id)" (dragend)="piece.set(null)" (click)="piece.set(option.id)">
                  {{ option.text }}
                </button>
              }
            </div>
            <div class="slots">
              <h3>Answer order</h3>
              @for (option of v.question.options; track $index; let i = $index) {
                <button type="button" [disabled]="busy()" (dragover)="$event.preventDefault()"
                  (drop)="drop($event, i)" (click)="place(i)" [attr.aria-label]="'Slot ' + (i + 1) + ': ' + slotText(i)">
                  <strong>[{{ i + 1 }}]</strong> {{ slotText(i) }}
                </button>
              }
            </div>
            </div>
          }
          @case ('DEBUG') {
            <textarea id="debugSnippet" aria-label="Java code snippet to debug" rows="16" maxlength="2000"
              autocomplete="off" autocapitalize="off" spellcheck="false" wrap="off" [disabled]="busy()"
              [value]="answers()[0] || ''" (input)="answers.set([$any($event.target).value])"
              (drop)="$event.preventDefault()" (keydown.tab)="indent($event)"></textarea>
            @if (v.question.debug && v.run) {
              <div class="debug-run-bar">
                <label for="debugTestCase">Test Case</label>
                <select id="debugTestCase" [value]="sampleIndex()" [disabled]="busy() || running()"
                  (change)="sampleIndex.set(+$any($event.target).value)">
                  @for (sample of v.samples ?? []; track $index) {
                    <option [value]="$index">Test Case {{ $index + 1 }}</option>
                  }
                </select>
                <button id="debugRunBtn" class="debug-run-btn" type="button"
                  [disabled]="busy() || running() || !valid() || !v.samples?.length" (click)="run()">
                  {{ running() ? 'Running…' : 'Run' }}
                </button>
                <span role="status">{{ runStatus() }}</span>
              </div>
              @if (runOutput()) { <pre id="debugRunOutput">{{ runOutput() }}</pre> }
            }
          }
          @default {
            <label for="followupAnswer">{{ v.question.kind === 'SHORT_ANSWER' ? 'Your explanation' : 'Your answer' }}</label>
            <textarea id="followupAnswer" [rows]="v.question.kind === 'FIB' ? 2 : 5" maxlength="2000"
              autocomplete="off" spellcheck="false" [disabled]="busy()" [value]="answers()[0] || ''"
              (input)="answers.set([$any($event.target).value])"></textarea>
          }
        }
        <p role="alert">{{ error() }}</p>
      </section>
    }
  `,
  styles: `
    :host { display:none; min-width:0; text-align:left; color:var(--text); font-family:var(--sans); }
    :host.active { display:block; width:100%; max-width:760px; background:#0A0A0A; border:1px solid var(--line); border-radius:8px; margin:24px auto 40px; overflow:auto; }
    :host.drag-layout { max-width:1100px; }
    section { padding:20px 22px; }
    h2 { font-size:20px; margin:8px 0 18px; }
    h3 { font-size:14px; margin:0 0 6px; } .progress { color:var(--amber); font-size:12px; font-weight:600; }
    pre { white-space:pre-wrap; overflow-wrap:anywhere; font:14px/1.7 var(--mono); color:var(--text); margin:0 0 20px; }
    p { line-height:1.5; } label { display:block; margin:16px 0 8px; }
    textarea { box-sizing:border-box; width:100%; background:var(--bg); color:var(--text); border:1px solid var(--text-dim); border-radius:6px; padding:12px; font:14px/1.6 var(--mono); resize:vertical; }
    button { background:var(--bg); color:var(--text); border:1px solid var(--text-dim); border-radius:6px; padding:12px 16px; cursor:pointer; text-align:left; white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; }
    .choices,.pieces,.slots { display:grid; gap:10px; margin:12px 0; }
    .drag-columns { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:24px; }
    .pieces,.slots { align-content:start; min-width:0; }
    #debugSnippet { min-height:320px; tab-size:2; }
    .debug-run-bar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:14px 0; font-size:12px; }
    .debug-run-bar label { margin:0; }
    .debug-run-bar select { background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:8px; font:inherit; }
    .debug-run-btn { padding:8px 18px; border-color:var(--amber); color:var(--amber); font-size:12px; }
    .debug-run-bar select:focus-visible { outline:2px solid var(--amber); outline-offset:3px; }
    #debugRunOutput { background:var(--bg); border:1px solid var(--line); padding:14px; max-height:260px; overflow:auto; }
    .pieces button { -webkit-user-drag:element; cursor:grab; }
    .slots button { border-style:dashed; min-height:54px; }
    button.selected { border-color:var(--amber); background:color-mix(in srgb,var(--amber) 12%,var(--bg)); } button:disabled { opacity:.5; cursor:default; }
    button:focus-visible,textarea:focus-visible { outline:2px solid var(--amber); outline-offset:3px; }
    [role=alert] { color:var(--amber); }
    @media (max-width:480px) { section { padding:16px; } .drag-columns { gap:12px; } button { padding:10px; font-size:12px; } }
  `,
})
export class Followup {
  readonly view = input<FollowupView | null>(null);
  readonly answers = linkedSignal(() => {
    const q = this.view()?.question;
    return q?.kind === 'DEBUG' && q.debug ? [q.debug.starterCode] : [] as string[];
  });
  readonly piece = linkedSignal(() => { this.view(); return null as string | null; });
  readonly busy = signal(false);
  readonly error = signal('');
  readonly sampleIndex = linkedSignal(() => { this.view(); return 0; });
  readonly running = linkedSignal(() => { this.view(); return false; });
  readonly runStatus = linkedSignal(() => { this.view(); return ''; });
  readonly runOutput = linkedSignal(() => { this.view(); return ''; });
  readonly label = computed(() => ({ FIB: 'Fill in the blank', MCQ: 'Choose an answer', DRAG_DROP: 'Place the missing parts', DEBUG: 'Debug the code', SHORT_ANSWER: 'Essay' }[this.view()?.question.kind ?? 'FIB']));
  readonly valid = computed(() => {
    const v = this.view(), a = this.answers();
    if (!v) return false;
    return v.question.kind === 'DRAG_DROP'
      ? a.length === v.question.options.length && a.every(x => !!x) && new Set(a).size === a.length
      : a.length === 1 && !!a[0].trim();
  });
  slotText(i: number) { return this.view()?.question.options.find(o => o.id === this.answers()[i])?.text ?? 'Place a piece here'; }
  async run() {
    const v = this.view(), debug = v?.question.debug, sample = v?.samples?.[this.sampleIndex()];
    if (!v?.run || v.question.kind !== 'DEBUG' || !debug || !sample || !this.valid() || this.busy() || this.running()) return;
    const snippet = this.answers()[0];
    this.running.set(true); this.runStatus.set('Running…'); this.runOutput.set('');
    try {
      const result = await v.run(debug.prefix + snippet + debug.suffix, sample.stdin);
      if (this.view() !== v) return; // Ignore late results after submission, expiry, or another question.
      if (this.answers()[0] !== snippet) { this.runStatus.set('Code changed. Run again to test your latest changes.'); return; }
      const got = (result.stdout ?? '').trimEnd(), expected = sample.expectedOutput.trimEnd();
      const matched = result.status === 'Accepted' && got === expected;
      this.runStatus.set(matched ? 'Matches expected output' : result.status === 'Accepted' ? 'Output does not match' : result.status);
      this.runOutput.set('Input:\n' + sample.stdin + '\nExpected output:\n' + expected + '\n\nYour output:\n' + (got || '(no output)')
        + (result.stderr ? '\n\nErrors:\n' + result.stderr : '')
        + (result.execTimeMs != null ? '\n\nExecution time: ' + result.execTimeMs + ' ms' : ''));
    } catch {
      if (this.view() === v) this.runStatus.set('Could not run the code. Please try again.');
    } finally {
      if (this.view() === v) this.running.set(false);
    }
  }
  indent(event: Event) {
    const key = event as KeyboardEvent;
    if (key.shiftKey) return; // Shift+Tab can leave the editor.
    key.preventDefault();
    const input = key.target as HTMLTextAreaElement;
    if (this.busy() || input.value.length + 2 > 2000) return;
    input.setRangeText('  ', input.selectionStart, input.selectionEnd, 'end');
    this.answers.set([input.value]);
  }
  drag(event: DragEvent, id: string) { this.piece.set(id); event.dataTransfer?.setData('application/x-challenge-piece', id); }
  drop(event: DragEvent, i: number) { event.preventDefault(); this.place(i); }
  place(i: number) {
    const id = this.piece(), v = this.view();
    if (!id || !v || this.busy()) return;
    const a = Array.from({ length: v.question.options.length }, (_, j) => this.answers()[j] ?? '');
    const old = a.indexOf(id); if (old >= 0) a[old] = '';
    a[i] = id; this.answers.set(a); this.piece.set(null);
  }
  async submit() {
    const v = this.view(); if (!v || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const answers = [...this.answers()];
      if (answers.every(answer => !answer.trim()) || (v.question.kind === 'DEBUG' && v.question.debug
          && answers[0]?.trim() === v.question.debug.starterCode.trim())) {
        await v.submit([]);
      } else if (v.question.kind === 'DEBUG' && v.question.debug) {
        await v.submit(answers, v.question.debug.prefix + answers[0] + v.question.debug.suffix);
      } else { await v.submit(answers); }
    }
    catch { this.error.set('Could not confirm your answer. Retry; it will not be counted twice.'); }
    finally { this.busy.set(false); }
  }
}
