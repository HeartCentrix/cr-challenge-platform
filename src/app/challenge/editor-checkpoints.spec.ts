import { EditorCheckpoints } from './editor-checkpoints';
import { EditorActivityReport } from './editor-activity';

describe('Editor checkpoint batching', () => {
  let sender: EditorCheckpoints, code: string, report: EditorActivityReport;
  let request: jasmine.Spy;
  beforeEach(() => {
    code = 'starter';
    report = { version: 1, questionSlug: 'test', startedAt: '2026-09-10T00:00:00Z', elapsedMs: 0,
      question: { copy: 0, cut: 0, paste: 0, drop: 0 }, answer: { copy: 0, cut: 0, paste: 0, drop: 0 },
      keydownCount: 0, trustedKeydownCount: 0, syntheticEvents: 0, modelChangeCount: 0, unexplainedChangeCount: 0,
      observedPasteCount: 0, insertedCharacters: 0, deletedCharacters: 0, droppedEvents: 0, events: [] };
    request = spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 204 }));
    sender = new EditorCheckpoints('/test-checkpoints', () => code, () => structuredClone(report));
  });
  afterEach(() => sender.dispose());

  it('sends no unchanged/idle state and advances sequence only after acknowledgement', async () => {
    await sender.flush(); report.elapsedMs = 30000; await sender.flush(); expect(request).not.toHaveBeenCalled();
    code = 'new code'; await sender.flush();
    expect(JSON.parse(request.calls.mostRecent().args[1].body).sequence).toBe(1);
    report.elapsedMs = 60000; await sender.flush(); expect(request).toHaveBeenCalledTimes(1);
    code = 'next edit'; await sender.flush();
    expect(JSON.parse(request.calls.mostRecent().args[1].body).sequence).toBe(2);
    sender.dispose(); code = 'late'; await sender.flush(); expect(request).toHaveBeenCalledTimes(2);
  });

  it('retries the exact immutable payload after a delivery failure before sending newer changes', async () => {
    request.and.resolveTo(new Response(null, { status: 503 })); code = 'first'; await sender.flush();
    const first = request.calls.mostRecent().args[1].body;
    code = 'second'; request.and.resolveTo(new Response(null, { status: 204 })); await sender.flush();
    expect(request.calls.mostRecent().args[1].body).toBe(first);
    await sender.flush(); expect(JSON.parse(request.calls.mostRecent().args[1].body).sourceCode).toBe('second');
  });

  it('sends notable events only, excludes personal data, and bounds source size', async () => {
    code = 'x'.repeat(32001); await sender.flush(); expect(request).not.toHaveBeenCalled();
    code = 'x'.repeat(80);
    report.events = [{ offsetMs: 0, kind: 'key-character', area: 'answer', trusted: true },
      { offsetMs: 0, kind: 'bulk-unexplained', area: 'answer', trusted: null, inserted: 80, deleted: 0 },
      { offsetMs: 0, kind: 'copy-observed', area: 'question', trusted: true },
      { offsetMs: 0, kind: 'cut-observed', area: 'answer', trusted: true },
      { offsetMs: 0, kind: 'paste-observed', area: 'answer', trusted: true }];
    await sender.flush();
    const body = JSON.parse(request.calls.mostRecent().args[1].body);
    expect(body.activity.events.map((e: { kind: string }) => e.kind)).toEqual(['bulk-unexplained', 'copy-observed', 'cut-observed', 'paste-observed']);
    expect(Object.keys(body).sort()).toEqual(['activity','sequence','slug','sourceCode','token']);
  });
});
