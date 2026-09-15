import { TestBed } from '@angular/core/testing';
import { DebugRunResult, Followup, FollowupView } from './followup';

describe('Follow-up cycle controls', () => {
  function setup(kind: FollowupView['question']['kind'] = 'FIB') {
    const fixture = TestBed.createComponent(Followup);
    const submit = jasmine.createSpy('submit').and.resolveTo();
    const view: FollowupView = { round: 1, question: { ordinal: 1, kind, prompt: '<script>not html</script>',
      options: [{id:'A',text:'First piece'},{id:'B',text:'Second piece'},{id:'C',text:'Third piece'}] }, submit };
    fixture.componentRef.setInput('view', view); fixture.detectChanges();
    return {fixture, component: fixture.componentInstance, view, submit};
  }
  it('recognizes entered text and safely renders the question inside the answer card', () => {
    const {fixture,component} = setup();
    expect(component.valid()).toBeFalse();
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<script>not html</script>');
    component.answers.set(['   ']); expect(component.valid()).toBeFalse();
    component.answers.set(['+']); expect(component.valid()).toBeTrue();
  });
  it('does not render an additional submit or next button', () => {
    const {fixture} = setup();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
  it('skips an empty answer through the shared action', async () => {
    const {component,submit} = setup();
    await component.submit();
    expect(submit).toHaveBeenCalledOnceWith([]);
    expect(component.error()).toBe('');
  });
  for (const kind of ['MCQ','DRAG_DROP','DEBUG','SHORT_ANSWER'] as const) {
    it('allows an empty ' + kind + ' answer', async () => {
      const {component,submit} = setup(kind);
      await component.submit();
      expect(submit).toHaveBeenCalledOnceWith([]);
    });
  }
  it('allows partial drag/drop answers', async () => {
    const {component,submit} = setup('DRAG_DROP');
    component.piece.set('A'); component.place(1);
    await component.submit();
    expect(submit).toHaveBeenCalledOnceWith(['','A','']);
  });
  it('lets candidates deselect an MCQ choice', () => {
    const {fixture,component} = setup('MCQ');
    const choice = fixture.nativeElement.querySelector('.choices button');
    choice.click(); fixture.detectChanges(); expect(component.answers()).toEqual(['A']);
    choice.click(); fixture.detectChanges(); expect(component.answers()).toEqual([]);
  });
  it('skips an unchanged DEBUG starter without calling Run', async () => {
    const {component,submit,run} = setupRun();
    await component.submit();
    expect(submit).toHaveBeenCalledOnceWith([]);
    expect(run).not.toHaveBeenCalled();
  });
  it('removes the follow-up panel from layout outside the follow-up phase', () => {
    const {fixture} = setup();
    expect(fixture.nativeElement.classList.contains('active')).toBeTrue();
    fixture.componentRef.setInput('view', null); fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('active')).toBeFalse();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });
  it('supports keyboard/click piece placement without duplicate use', () => {
    const {component} = setup('DRAG_DROP');
    component.piece.set('A'); component.place(0);
    component.piece.set('A'); component.place(1);
    expect(component.answers()).toEqual(['','A','']);
    component.piece.set('B'); component.place(0);
    component.piece.set('C'); component.place(2);
    expect(component.valid()).toBeTrue();
  });
  it('places the available pieces and answer slots into sibling columns', () => {
    const {fixture} = setup('DRAG_DROP');
    expect(fixture.nativeElement.classList.contains('drag-layout')).toBeTrue();
    expect(fixture.nativeElement.querySelector('.drag-columns > .pieces')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.drag-columns > .slots')).not.toBeNull();
  });
  it('labels short answers as Essay', () => {
    const {component} = setup('SHORT_ANSWER');
    expect(component.label()).toBe('Essay');
  });
  it('edits only the DEBUG snippet and wraps it exactly once when submitting', async () => {
    const {fixture,component,view,submit} = setup('DEBUG');
    const debug = {starterCode:'return 0;',prefix:'class Main { static int solve() {\n',suffix:'\n}}',languageId:62};
    fixture.componentRef.setInput('view',{...view,question:{...view.question,debug}}); fixture.detectChanges();
    const editor: HTMLTextAreaElement = fixture.nativeElement.querySelector('#debugSnippet');
    expect(editor.value).toBe('return 0;');
    expect(fixture.nativeElement.querySelector('#followupPrompt')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('class Main');
    editor.value='return 1;'; editor.dispatchEvent(new Event('input')); fixture.detectChanges();
    await component.submit();
    expect(submit).toHaveBeenCalledOnceWith(['return 1;'],debug.prefix+'return 1;'+debug.suffix);
  });
  it('resets answers when the server advances and does not carry them to another follow-up', () => {
    const {fixture,component,view} = setup();
    component.answers.set(['answer']);
    fixture.componentRef.setInput('view', {...view,question:{...view.question,ordinal:2}});
    fixture.detectChanges(); expect(component.answers()).toEqual([]);
  });
  function setupRun() {
    const context = setup('DEBUG');
    const run = jasmine.createSpy('run').and.resolveTo({status:'Accepted',stdout:'7\n',stderr:null,execTimeMs:2});
    const debug = {starterCode:'return 0;',prefix:'class Main { int solve() {',suffix:'}}',languageId:62};
    const view: FollowupView = {...context.view,question:{...context.view.question,debug},run,
      samples:[{stdin:'1\n7\n',expectedOutput:'7'},{stdin:'1\n8\n',expectedOutput:'8'}]};
    context.fixture.componentRef.setInput('view',view); context.fixture.detectChanges();
    return {...context,view,run,debug};
  }
  it('runs the wrapped snippet on the selected public case without submitting', async () => {
    const {component,fixture,submit,run,debug} = setupRun();
    component.answers.set(['return 7;']);
    fixture.nativeElement.querySelector('#debugRunBtn').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(run).toHaveBeenCalledOnceWith(debug.prefix+'return 7;'+debug.suffix,'1\n7\n');
    expect(submit).not.toHaveBeenCalled();
    expect(component.answers()).toEqual(['return 7;']);
    expect(component.runStatus()).toBe('Matches expected output');
    expect(fixture.nativeElement.querySelector('#debugRunOutput').textContent).toContain('Execution time: 2 ms');
    component.sampleIndex.set(1); await component.run();
    expect(run.calls.mostRecent().args[1]).toBe('1\n8\n');
    expect(component.runStatus()).toBe('Output does not match');
  });
  it('blocks duplicate runs and discards a result after moving to another question', async () => {
    const {component,fixture,view,run} = setupRun();
    let finish!: (result: DebugRunResult) => void;
    run.and.returnValue(new Promise<DebugRunResult>(resolve => finish=resolve));
    const pending=component.run(); await component.run();
    expect(run).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('view',{...view,round:2}); fixture.detectChanges();
    finish({status:'Accepted',stdout:'7',stderr:null,execTimeMs:2}); await pending;
    expect(component.runOutput()).toBe(''); expect(component.runStatus()).toBe('');
    expect(component.running()).toBeFalse();
  });
  it('keeps the snippet usable after a failed run and does not submit it', async () => {
    const {component,run,submit} = setupRun(); run.and.rejectWith(new Error('offline'));
    await component.run();
    expect(component.runStatus()).toContain('Please try again');
    expect(component.answers()).toEqual(['return 0;']);
    expect(component.running()).toBeFalse(); expect(submit).not.toHaveBeenCalled();
  });
  it('does not display stale output if the candidate edited during execution', async () => {
    const {component,run} = setupRun();
    let finish!: (result: DebugRunResult) => void;
    run.and.returnValue(new Promise<DebugRunResult>(resolve => finish=resolve));
    const pending=component.run(); component.answers.set(['return 9;']);
    finish({status:'Accepted',stdout:'7',stderr:null,execTimeMs:2}); await pending;
    expect(component.runOutput()).toBe(''); expect(component.runStatus()).toContain('Code changed');
  });
  it('retains an answer after a lost response so the same request can be retried', async () => {
    const {component,submit} = setup();
    submit.and.rejectWith(new Error('network')); component.answers.set(['answer']);
    await component.submit();
    expect(component.answers()).toEqual(['answer']); expect(component.busy()).toBeFalse();
    expect(component.error()).toContain('Retry');
  });
  it('submits selected option IDs only and blocks concurrent clicks', async () => {
    const {component,submit} = setup('MCQ');
    let finish!: () => void;
    submit.and.returnValue(new Promise<void>(resolve => finish=resolve));
    component.answers.set(['B']); const pending=component.submit();
    await component.submit(); expect(submit).toHaveBeenCalledOnceWith(['B']);
    finish(); await pending;
  });
});
