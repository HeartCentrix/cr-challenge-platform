import { ActivityEditor, EditorActivity } from './editor-activity';

describe('Editor activity boundaries', () => {
  let portal: HTMLElement, editor: ActivityEditor, activity: EditorActivity, value: string;
  let changed: Parameters<ActivityEditor['onDidChangeModelContent']>[0];
  let pasted: () => void;
  const event = (type: string) => new Event(type, { bubbles: true, cancelable: true });
  const fire = (id: string, e: Event) => { portal.querySelector('#' + id)!.dispatchEvent(e); return e; };
  beforeEach(() => {
    portal = document.createElement('div');
    portal.innerHTML = '<pre id="problemPrompt">Prompt</pre><div id="editorHost"><textarea id="answer"></textarea></div><div id="modalOverlay"><input id="email"></div>';
    document.body.append(portal);
    value = 'starter';
    editor = { getValue: () => value,
      onDidChangeModelContent: listener => { changed = listener; return { dispose() {} }; },
      onDidPaste: listener => { pasted = listener; return { dispose() {} }; } };
    activity = new EditorActivity(portal, editor, 'test-question');
  });
  afterEach(() => { activity.dispose(); portal.remove(); window.getSelection()?.removeAllRanges(); });

  it('blocks clipboard actions and excludes personal fields from tracking', () => {
    expect(fire('problemPrompt', event('copy')).defaultPrevented).toBeTrue();
    expect(fire('answer', event('paste')).defaultPrevented).toBeTrue();
    expect(fire('answer', event('cut')).defaultPrevented).toBeTrue();
    expect(fire('answer', event('drop')).defaultPrevented).toBeTrue();
    expect(fire('email', event('paste')).defaultPrevented).toBeFalse();
    fire('email', new KeyboardEvent('keydown', { key: 's', bubbles: true }));
    const report = activity.snapshot();
    expect(report.question.copy).toBe(1); expect(report.answer.paste).toBe(1); expect(report.answer.drop).toBe(1);
    expect(report.answer.cut).toBe(1);
    expect(report.events.some(e => e.kind === 'copy-blocked')).toBeTrue();
    expect(report.events.some(e => e.kind === 'cut-blocked')).toBeTrue();
    expect(report.keydownCount).toBe(0);
  });

  it('blocks Windows and Mac shortcuts and deduplicates the resulting clipboard event', () => {
    const shortcut = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true });
    expect(fire('answer', shortcut).defaultPrevented).toBeTrue();
    fire('answer', event('paste'));
    expect(activity.snapshot().answer.paste).toBe(1);
    expect(fire('answer', new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true })).defaultPrevented).toBeTrue();
    expect(activity.snapshot().answer.copy).toBe(1);
  });

  it('blocks clipboard beforeinput and selection copying with a body target', () => {
    const range = document.createRange(); range.selectNodeContents(portal.querySelector('#problemPrompt')!);
    window.getSelection()?.addRange(range);
    const copy = event('copy'); document.body.dispatchEvent(copy); expect(copy.defaultPrevented).toBeTrue();
    const paste = new InputEvent('beforeinput', { inputType: 'insertFromPaste', bubbles: true, cancelable: true });
    expect(fire('answer', paste).defaultPrevented).toBeTrue();
    const cut = new InputEvent('beforeinput', { inputType: 'deleteByCut', bubbles: true, cancelable: true });
    expect(fire('answer', cut).defaultPrevented).toBeTrue();
  });

  it('records categories and untrusted events without literal keys or code content', () => {
    for (const key of 'sensitive-text') fire('answer', new KeyboardEvent('keydown', { key, bubbles: true }));
    const report = activity.snapshot();
    expect(report.keydownCount).toBe(14); expect(report.trustedKeydownCount).toBe(0);
    expect(report.syntheticEvents).toBe(14);
    expect(JSON.stringify(report)).not.toContain('sensitive-text');
    expect(report.events.every(e => e.kind === 'key-character')).toBeTrue();
  });

  it('blocks document-targeted copy while the code editor has focus', () => {
    (portal.querySelector('#answer') as HTMLTextAreaElement).focus();
    const copy = event('copy');
    document.body.dispatchEvent(copy);
    expect(copy.defaultPrevented).toBeTrue();
    expect(activity.snapshot().answer.copy).toBe(1);
  });

  it('tracks model replacement and observed Monaco paste even without DOM clipboard events', () => {
    expect(activity.snapshot().modelChangeCount).toBe(0); // Starter is excluded.
    value = 'injected'; changed({ changes: [{ text: value, rangeLength: 7 }], isFlush: true }); pasted();
    const report = activity.snapshot();
    expect(report.unexplainedChangeCount).toBe(1); expect(report.observedPasteCount).toBe(1);
    expect(report.answer.paste).toBe(1); expect(report.insertedCharacters).toBe(8);
    expect(JSON.stringify(report)).not.toContain('injected');
  });

  it('caps timeline memory, preserves aggregate counts, isolates snapshots and disposes listeners', () => {
    for (let i = 0; i < 5005; i++) fire('answer', new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    const report = activity.snapshot(); expect(report.events.length).toBe(5000); expect(report.droppedEvents).toBe(5);
    expect(report.keydownCount).toBe(5005); report.answer.copy = 999;
    expect(activity.snapshot().answer.copy).toBe(0);
    activity.dispose(); expect(fire('answer', event('paste')).defaultPrevented).toBeFalse();
  });

  it('flags mass model replacements with character counts, even after recent editor interaction', () => {
    expect(activity.snapshot().bulkChangeCount).toBe(0);
    fire('answer', new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    value = 'x'.repeat(200);
    changed({ changes: [{ text: value, rangeLength: 7 }], isFlush: true });
    const report = activity.snapshot();
    expect(report.bulkChangeCount).toBe(1); expect(report.unexplainedBulkChangeCount).toBe(1);
    expect(report.largestInsertion).toBe(200);
    expect(report.events.find(e => e.kind === 'bulk-unexplained')?.inserted).toBe(200);
    expect(report.events.find(e => e.kind === 'bulk-unexplained')?.deleted).toBe(7);
    expect(portal.textContent).not.toContain('Please type your answer');
  });

  it('detects rapid small insertions as one mass-input burst but excludes undo and redo', () => {
    for (let i = 0; i < 10; i++) {
      value += 'x'.repeat(10); changed({ changes: [{ text: 'x'.repeat(10), rangeLength: 0 }] });
    }
    expect(activity.snapshot().bulkChangeCount).toBe(1);
    changed({ changes: [{ text: 'x'.repeat(500), rangeLength: 500 }], isUndoing: true });
    changed({ changes: [{ text: 'x'.repeat(500), rangeLength: 500 }], isRedoing: true });
    expect(activity.snapshot().bulkChangeCount).toBe(1);
    expect(activity.snapshot().largestInsertion).toBe(10);
  });

  it('does not flag ordinary one-character typing with matching browser-trusted key counts', () => {
    // Browser trust cannot be forged in a DOM event; supply its count via the test fixture only.
    for (let i = 0; i < 100; i++) {
      (activity as unknown as { report: { trustedKeydownCount: number } }).report.trustedKeydownCount++;
      value += 'x'; changed({ changes: [{ text: 'x', rangeLength: 0 }] });
    }
    expect(activity.snapshot().bulkChangeCount).toBe(0);
  });
});
