import type { EditorActivityReport } from './editor-activity';

/** Best-effort changed-state batching. No keystroke API calls or personal fields. */
export class EditorCheckpoints {
  readonly token = crypto.randomUUID();
  private sequence = 1;
  private lastSaved: string;
  private pending?: { body: string; signature: string };
  private inFlight?: Promise<void>;
  private stopped = false;
  private disabled = false;
  private controller?: AbortController;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly url: string, private readonly code: () => string,
      private readonly snapshot: () => EditorActivityReport) {
    this.lastSaved = this.capture().signature;
    this.timer = setInterval(() => { void this.flush(); }, 30000);
  }

  private capture() {
    const sourceCode = this.code();
    const activity = this.snapshot();
    // Keep notable events, not thousands of key categories, in periodic checkpoints.
    activity.events = activity.events.filter(e => /^(bulk-|unobserved-|paste-observed|.*-blocked$)/.test(e.kind)).slice(-100);
    const { elapsedMs, ...stable } = activity;
    return { sourceCode, activity, signature: JSON.stringify([sourceCode, stable]) };
  }

  flush(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (this.stopped || this.disabled || this.sequence > 120) return Promise.resolve();
    const current = this.capture();
    if (!this.pending) {
      if (current.signature === this.lastSaved || current.sourceCode.length > 32000) return Promise.resolve();
      this.pending = { signature: current.signature, body: JSON.stringify({ token: this.token, sequence: this.sequence,
        slug: current.activity.questionSlug, sourceCode: current.sourceCode, activity: current.activity }) };
    }
    const pending = this.pending;
    this.controller = new AbortController();
    const timeout = setTimeout(() => this.controller?.abort(), 1500);
    this.inFlight = fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: pending.body, signal: this.controller.signal, cache: 'no-store' })
      .then(response => {
        if (response.ok) { this.lastSaved = pending.signature; this.pending = undefined; this.sequence++; }
        // Offline/429/5xx retries reuse the exact sequence/body. No tight retry loops.
        else if ([400, 404, 409, 410, 413].includes(response.status)) this.disabled = true;
      }).catch(() => { /* Grading stays available when checkpoint delivery fails. */ })
      .finally(() => { clearTimeout(timeout); this.inFlight = undefined; });
    return this.inFlight;
  }

  dispose() { this.stopped = true; clearInterval(this.timer); this.controller?.abort(); }
}
